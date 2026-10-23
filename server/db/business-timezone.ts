export const BUSINESS_TIMEZONE = "Asia/Ho_Chi_Minh";

/** pg lets URL options override Pool config and PGOPTIONS, so bind it there too. */
export function businessTimezoneConnectionOptions(connectionString: string, environmentOptions = "") {
  const url = new URL(connectionString);
  const urlOptions = url.searchParams.getAll("options");
  const existing = urlOptions.length ? urlOptions[urlOptions.length - 1] : environmentOptions;
  const options = `${existing?.trim() || ""} -c timezone=${BUSINESS_TIMEZONE}`.trim();
  url.searchParams.set("options", options);
  return { connectionString: url.toString(), options };
}
