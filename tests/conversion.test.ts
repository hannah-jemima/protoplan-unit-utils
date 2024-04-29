import { units } from "./conversion.mock";





test('inter-product conversion (Micro-C caps -> powder) prefers path via mg active ingredient', async() =>
{
  const path = await units.getPath(3, 1961, [13, 21021]);

  expect(path).toContain(12);
  expect(path).toStrictEqual([3, 12, 5, 1961]);
});