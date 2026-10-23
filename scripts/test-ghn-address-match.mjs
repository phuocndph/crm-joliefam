import assert from 'node:assert/strict';
import { createAddressGeneration, matchProvince, matchDistrict, matchWard, normalizeGhnAddress, matchProvinceTail, matchDistrictTail, matchWardTail, filterGhnDirectory, ghnAddressSuggestionQuery } from '../src/lib/ghn-address-match.ts';

const provinces = [
  { ProvinceID: 1, ProvinceName: 'Thành phố Hồ Chí Minh', NameExtension: ['TP.HCM', 'Sài Gòn'] },
  { ProvinceID: 2, ProvinceName: 'Hà Nội' },
  { ProvinceID: 3, ProvinceName: 'Đắk Lắk' },
];
const districts = [
  { DistrictID: 11, DistrictName: 'Quận 1' },
  { DistrictID: 110, DistrictName: 'Quận 10' },
  { DistrictID: 12, DistrictName: 'Huyện Củ Chi', NameExtension: ['Cu Chi'] },
  { DistrictID: 13, DistrictName: 'Thị xã Bình Minh' },
];
const wards = [
  { WardCode: '01', WardName: 'Phường 1' },
  { WardCode: '10', WardName: 'Phường 10' },
  { WardCode: 'bn', WardName: 'Phường Bến Nghé', NameExtension: ['Ben Nghe'] },
  { WardCode: 'xa', WardName: 'Xã An Phú' },
  { WardCode: 'tt', WardName: 'Thị trấn Củ Chi' },
];
const chosen = result => { assert.equal(result.kind, 'unique'); return result.value; };

assert.equal(chosen(matchProvince('12 Nguyễn Huệ, P. Bến Nghé, Q.1, TP.HCM', provinces)).ProvinceID, 1);
assert.equal(chosen(matchProvince('12 Nguyen Hue, P. Ben Nghe, Q.1, TPHCM', provinces)).ProvinceID, 1);
assert.equal(chosen(matchProvince('12 Nguyen Hue, Sai Gon', provinces)).ProvinceID, 1);
assert.equal(chosen(matchProvince('12 ABC\nĐắk Lắk', provinces)).ProvinceID, 3);
assert.equal(chosen(matchProvince('12 ABC, Dak Lak', provinces)).ProvinceID, 3);
assert.equal(chosen(matchDistrict('12 Nguyễn Huệ P.Bến Nghé Q.1 TP.HCM', districts)).DistrictID, 11);
assert.equal(chosen(matchDistrict('12 ABC, Q.10, TPHCM', districts)).DistrictID, 110);
assert.equal(chosen(matchDistrict('12 ABC, H.Củ Chi, TPHCM', districts)).DistrictID, 12);
assert.equal(chosen(matchDistrict('12 ABC, TX.Bình Minh', districts)).DistrictID, 13);
assert.equal(chosen(matchWard('12 ABC, P.01, Q.1, TP.HCM', wards)).WardCode, '01');
assert.equal(chosen(matchWard('12 ABC, X.An Phú, H.Củ Chi, TP.HCM', wards)).WardCode, 'xa');
assert.equal(chosen(matchWard('12 ABC, TT.Củ Chi, H.Củ Chi, TP.HCM', wards)).WardCode, 'tt');
assert.equal(chosen(matchWard('12 Nguyễn Huệ P.Bến Nghé Q.1 TP.HCM', wards)).WardCode, 'bn');
assert.equal(matchProvince('12 đường Hà Nội, P.01', provinces).kind, 'missing');
assert.equal(matchProvince('12 đường TP Hà Nội, P.01', provinces).kind, 'missing');
assert.equal(matchProvince('12 Hà Nội', provinces).kind, 'missing');
assert.equal(matchDistrict('Số nhà 1, P.01, TP.HCM', districts).kind, 'missing');
assert.equal(matchWard('1, Q.1, TP.HCM', wards).kind, 'missing');
assert.equal(matchDistrict('12 ABC, P.Bến Nghé, TP.HCM', districts).kind, 'missing');
assert.equal(matchDistrict('12 ABC, Q.100, TP.HCM', districts).kind, 'missing');
assert.equal(matchWard('P.An Phú', [{WardCode:'a',WardName:'Phường An'},{WardCode:'b',WardName:'Phường An Phú'}]).kind, 'unique');
assert.equal(chosen(matchWard('P.An Phú', [{WardCode:'a',WardName:'Phường An'},{WardCode:'b',WardName:'Phường An Phú'}])).WardCode, 'b');
assert.equal(matchProvince('Hà Nội, TP.HCM', provinces).kind, 'ambiguous');
assert.equal(matchWard('Bến Nghé', [...wards,{WardCode:'duplicate-name',WardName:'Bến Nghé'}]).kind, 'ambiguous');
assert.equal(chosen(matchWard('Bến Nghé', [...wards,wards[2]])).WardCode, 'bn');
assert.equal(normalizeGhnAddress('P.01, Q.1, TP.HCM'), 'phuong 1 quan 1 thanh pho ho chi minh');

const resolveTail = address => {
  const province = matchProvinceTail(address, provinces);
  if (province.kind !== 'unique') return province.kind;
  const district = matchDistrictTail(province.rest, districts);
  if (district.kind !== 'unique') return district.kind;
  const ward = matchWardTail(district.rest, wards);
  if (ward.kind !== 'unique') return ward.kind;
  return [province.value.ProvinceID, district.value.DistrictID, ward.value.WardCode];
};
for (const address of [
  '12 Nguyễn Huệ Bến Nghé Quận 1 Hồ Chí Minh',
  '12 Nguyen Hue Ben Nghe Quan1 Ho Chi Minh',
  '12 Nguyễn Huệ - Bến Nghé - Quận 1 - TP.HCM',
  '12 Nguyen Hue P.Ben Nghe Q.01 TPHCM',
  '12 Nguyễn Huệ, P. Bến Nghé, Q.1, TP.HCM',
]) assert.deepEqual(resolveTail(address), [1, 11, 'bn'], address);
assert.equal(chosen(matchDistrictTail('12 ABC Quận 10', districts)).DistrictID, 110);
assert.equal(matchDistrictTail('Số nhà 1', districts).kind, 'missing');
assert.equal(matchWardTail('12 nhà 1', wards).kind, 'missing');
assert.equal(matchDistrictTail('12 ABC Q.100', districts).kind, 'missing');
assert.equal(resolveTail('12 Hà Nội'), 'missing', 'bare province may explore but cannot resolve three levels');
assert.equal(resolveTail('12 đường Bến Nghé Quận 1 Hồ Chí Minh'), 'missing');
assert.equal(resolveTail('12 đường Phường Bến Nghé Quận 1 Hồ Chí Minh'), 'missing');
assert.equal(matchProvinceTail('12 đường Hà Nội', provinces).kind, 'missing');
assert.equal(matchProvinceTail('12 đường TP Hà Nội', provinces).kind, 'missing');
assert.equal(matchWardTail('12 đường Phường Bến Nghé', wards).kind, 'missing');
const overlappingWards = [...wards, {WardCode:'shorter',WardName:'Phường Nghé'}];
assert.equal(matchWardTail('12 đường Bến Nghé', overlappingWards).kind, 'missing');
assert.equal(matchWardTail('12 đường Phường Bến Nghé', overlappingWards).kind, 'missing');
const roadProvince = chosen(matchProvinceTail('12 đường Bến Nghé Quận 1 Hồ Chí Minh', provinces));
const roadProvinceTail = matchProvinceTail('12 đường Bến Nghé Quận 1 Hồ Chí Minh', provinces);
assert.equal(roadProvince.ProvinceID, 1);
const roadDistrictTail = matchDistrictTail(roadProvinceTail.rest, districts);
assert.equal(roadDistrictTail.kind, 'unique');
assert.equal(matchWardTail(roadDistrictTail.rest, overlappingWards).kind, 'missing', 'complete chain cannot fall back to shorter road suffix');
assert.equal(matchWardTail('12 Bến Nghé', [...wards, {WardCode:'duplicate',WardName:'Phường Bến Nghé'}]).kind, 'ambiguous');
assert.equal(chosen(matchWardTail('12 Bến Nghé', [...wards, wards[2]])).WardCode, 'bn');
assert.equal(ghnAddressSuggestionQuery('Hà N', 'province'), 'ha n');
assert.equal(ghnAddressSuggestionQuery('12 Nguyễn Huệ, Hà N', 'province'), 'ha n');
assert.equal(ghnAddressSuggestionQuery('12 đường Hà N', 'province'), null);
assert.equal(ghnAddressSuggestionQuery('12 đường TP Hà N', 'province'), null);
assert.equal(ghnAddressSuggestionQuery('12 ABC Quận Củ', 'district'), 'quan cu');
assert.deepEqual(filterGhnDirectory('Hà N', provinces, 'province', row => row.ProvinceName).map(row => row.ProvinceID), [2]);
assert.deepEqual(filterGhnDirectory('Hà Nam', provinces, 'province', row => row.ProvinceName), []);
assert.deepEqual(filterGhnDirectory('Q.1', districts, 'district', row => row.DistrictName).map(row => row.DistrictID), [11,110]);
assert.deepEqual(filterGhnDirectory('Ben N', wards, 'ward', row => row.WardName).map(row => row.WardCode), ['bn']);
assert.deepEqual(filterGhnDirectory('Bến', [...wards,{WardCode:'duplicate',WardName:'Phường Bến Nghé'}], 'ward', row => row.WardName).map(row => row.WardCode), ['bn','duplicate']);

// Delayed work shares exactly the generation used by the dialog's auto/manual loaders.
const generation = createAddressGeneration();
const pendingAuto = generation.next();
const latestTyped = generation.next();
assert.equal(generation.current(pendingAuto), false, 'typing invalidates before debounce');
const manualDistrict = generation.next();
const services = generation.capture();
assert.equal(generation.current(manualDistrict), true, 'service reads must not cancel ward reads');
assert.equal(services, manualDistrict);
assert.equal(generation.current(latestTyped), false, 'manual selection cancels auto work');
for (const event of ['reload', 'close', 'reopen', 'order change', 'unresolved attempt']) {
  const stale = generation.capture();
  generation.next();
  assert.equal(generation.current(stale), false, event + ' invalidates late responses');
}
console.log('PASS: GHN synthetic address matching and generation cancellation');
