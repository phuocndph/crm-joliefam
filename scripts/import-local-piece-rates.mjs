import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { access } from "node:fs/promises";
import ExcelJS from "exceljs";
import pg from "pg";

const { Client } = pg;

function parseArgs(argv) {
  const options = {};
  for (const argument of argv) {
    if (argument === "--apply") options.apply = true;
    else if (argument.startsWith("--file=")) options.file = argument.slice("--file=".length);
    else if (argument.startsWith("--sheet=")) options.sheet = argument.slice("--sheet=".length);
    else if (argument.startsWith("--effective-from=")) options.effectiveFrom = argument.slice("--effective-from=".length);
    else if (argument.startsWith("--price-list=")) options.priceList = argument.slice("--price-list=".length);
    else throw new Error(`Tham số không được hỗ trợ: ${argument}`);
  }
  return options;
}

function scalarCellValue(cell) {
  const value = cell.value;
  if (value && typeof value === "object" && "result" in value) return value.result;
  if (value && typeof value === "object" && "text" in value) return value.text;
  return value;
}

function normalizedText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parseRate(value, rowNumber) {
  const number = typeof value === "number" ? value : Number(String(value ?? "").replace(/[,.\s]/g, ""));
  if (!Number.isFinite(number) || number < 0) throw new Error(`Dòng ${rowNumber}: đơn giá không hợp lệ.`);
  return number;
}

async function readRates(filePath, sheetName) {
  await access(filePath);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.getWorksheet(sheetName);
  if (!worksheet) throw new Error(`Không tìm thấy sheet '${sheetName}'.`);

  const headerCode = normalizedText(scalarCellValue(worksheet.getCell("A1"))).toLowerCase();
  const headerRate = normalizedText(scalarCellValue(worksheet.getCell("C1"))).toLowerCase();
  if (headerCode !== "ma_sp" || headerRate !== "don_gia") {
    throw new Error(`Sheet '${sheetName}' không có cấu trúc ma_sp / tên sản phẩm / don_gia tại cột A:C.`);
  }

  const rates = [];
  const seenCodes = new Map();
  for (let rowNumber = 2; rowNumber <= worksheet.actualRowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const code = normalizedText(scalarCellValue(row.getCell(1)));
    const name = normalizedText(scalarCellValue(row.getCell(2)));
    const rawRate = scalarCellValue(row.getCell(3));
    if (!code && !name && (rawRate === null || rawRate === undefined || rawRate === "")) continue;
    if (!code) throw new Error(`Dòng ${rowNumber}: thiếu mã sản phẩm.`);
    if (!name) throw new Error(`Dòng ${rowNumber}: thiếu tên sản phẩm cho mã ${code}.`);
    const key = code.toLocaleLowerCase("vi");
    if (seenCodes.has(key)) throw new Error(`Mã ${code} bị trùng tại dòng ${seenCodes.get(key)} và ${rowNumber}.`);
    seenCodes.set(key, rowNumber);
    const notes = [];
    for (let column = 4; column <= worksheet.actualColumnCount; column += 1) {
      const note = normalizedText(scalarCellValue(row.getCell(column)));
      if (note) notes.push(note);
    }
    rates.push({ rowNumber, code, name, rate: parseRate(rawRate, rowNumber), note: notes.join(" | ") });
  }
  if (!rates.length) throw new Error(`Sheet '${sheetName}' không có dòng đơn giá nào.`);
  return rates;
}

function assertLocalDatabase(databaseUrl) {
  const parsed = new URL(databaseUrl);
  if (!new Set(["127.0.0.1", "localhost", "::1"]).has(parsed.hostname)) {
    throw new Error("Import bảng giá chỉ được phép chạy với PostgreSQL local.");
  }
  if (!parsed.pathname.replace(/^\//, "").startsWith("crm_local")) {
    throw new Error("Tên database import phải bắt đầu bằng 'crm_local'.");
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const filePath = path.resolve(options.file || process.env.PAYROLL_RATE_WORKBOOK || "");
  if (!options.file && !process.env.PAYROLL_RATE_WORKBOOK) {
    throw new Error("Thiếu --file=<đường dẫn file Excel> hoặc PAYROLL_RATE_WORKBOOK.");
  }
  const sheetName = options.sheet || "don-gia-moi";
  const effectiveFrom = options.effectiveFrom || "2026-01-01";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) throw new Error("--effective-from phải có định dạng YYYY-MM-DD.");
  const year = Number(effectiveFrom.slice(0, 4));
  const priceListName = options.priceList || `Bảng giá công may ${year}`;
  const databaseUrl = process.env.LOCAL_DATABASE_URL || "postgres://crm_local:crm_local_dev_only@127.0.0.1:55432/crm_local";
  assertLocalDatabase(databaseUrl);

  const rates = await readRates(filePath, sheetName);
  const sourceHash = createHash("sha256").update(JSON.stringify(rates.map(({ code, name, rate, note }) => ({ code, name, rate, note })))).digest("hex");
  const sourceReference = `Excel:${path.basename(filePath)}#${sheetName}:${sourceHash.slice(0, 16)}`;
  const reason = `Import bảng giá công may ${year} từ sheet ${sheetName}`;
  const client = new Client({ connectionString: databaseUrl });
  const stats = {
    sourceRows: rates.length,
    codesImported: 0,
    codesReused: 0,
    crmMappingsPending: rates.length,
    ratesCreated: 0,
    ratesReused: 0,
    rateConflicts: 0,
  };

  await client.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext('local-piece-rate-excel-import'))");
    const database = await client.query("select current_database() database");
    if (!String(database.rows[0]?.database || "").startsWith("crm_local")) throw new Error("Database đích không phải database CRM local.");

    let priceList = await client.query(`
      select id from local_price_lists
      where name=$1 and year=$2 and not is_snapshot_record
      order by created_at nulls last limit 1 for update`, [priceListName, year]);
    let priceListId = priceList.rows[0]?.id;
    if (!priceListId) {
      priceListId = randomUUID();
      await client.query(`
        insert into local_price_lists(id,name,year,status,tenant_id,is_snapshot_record,is_active,created_at,updated_at)
        values($1,$2,$3,'ACTIVE','local-tenant',false,true,now(),now())`, [priceListId, priceListName, year]);
    } else {
      await client.query("update local_price_lists set status='ACTIVE',is_active=true,updated_at=now() where id=$1", [priceListId]);
    }

    for (const entry of rates) {
      const sameImport = await client.query(`
        select id,rate,rate_unit,effective_from::text effective_from,status
        from local_product_rates
        where lower(piece_rate_code)=lower($1) and source_reference=$2
        order by created_at desc limit 1 for update`, [entry.code, sourceReference]);
      if (sameImport.rows[0]) {
        const existing = sameImport.rows[0];
        if (Number(existing.rate) !== entry.rate || existing.rate_unit !== "PIECE" || existing.effective_from !== effectiveFrom) {
          throw new Error(`Mã ${entry.code}: cùng nguồn import nhưng dữ liệu đơn giá đã khác.`);
        }
        stats.ratesReused += 1;
        stats.codesReused += 1;
        continue;
      }

      const overlap = await client.query(`
        select id,rate,source_reference
        from local_product_rates
        where lower(piece_rate_code)=lower($1) and status='APPROVED'
          and effective_from <= $2::date and (effective_to is null or effective_to >= $2::date)
        order by effective_from desc,created_at desc for update`, [entry.code, effectiveFrom]);
      if (overlap.rows.length) {
        const equivalent = overlap.rows.find((row) => Number(row.rate) === entry.rate);
        if (equivalent) {
          stats.ratesReused += 1;
          stats.codesReused += 1;
          continue;
        }
        stats.rateConflicts += 1;
        throw new Error(`Mã ${entry.code} đã có đơn giá hiệu lực khác ${entry.rate.toLocaleString("vi-VN")} đ; import đã được hoàn tác.`);
      }

      const rateId = randomUUID();
      await client.query(`
        insert into local_product_rates(
          id,product_id,piece_rate_code,piece_rate_name,source_row,rate,rate_unit,effective_from,status,reason,source_reference,
          is_snapshot_record,local_modified_at,created_at,updated_at
        ) values($1,null,$2,$3,$4,$5,'PIECE',$6,'APPROVED',$7,$8,false,now(),now(),now())`,
      [rateId, entry.code, entry.name, entry.rowNumber, entry.rate, effectiveFrom, reason, sourceReference]);
      await client.query(`
        insert into local_payroll_audit_events(entity_type,entity_id,action,reason)
        values('product_rates',$1,'IMPORT_APPROVE',$2)`, [rateId, `${reason}; mã ${entry.code}; dòng ${entry.rowNumber}`]);
      stats.ratesCreated += 1;
      stats.codesImported += 1;
    }

    if (options.apply) await client.query("commit");
    else await client.query("rollback");

    console.log(JSON.stringify({
      mode: options.apply ? "APPLIED" : "DRY_RUN",
      database: database.rows[0].database,
      file: filePath,
      sheet: sheetName,
      effectiveFrom,
      priceList: priceListName,
      sourceReference,
      ...stats,
    }, null, 2));
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
