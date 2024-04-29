import Units from "../src/Units";

const selectUnits = () => Promise.resolve([
  { unitId: 2, name: 'ml', formId: 2 },
  { unitId: 3, name: 'capsules', formId: 1 },
  { unitId: 5, name: 'g', formId: 3 },
  { unitId: 16, name: 'fl oz (US)', formId: 2 },
  { unitId: 1961, name: 'scoop (4 cc)', formId: 3, productId: 21021 },]);   // 250 g Micro-C Immune Power

const selectDirectConversions = () => Promise.resolve([
  { unitConversionId: 2,
    fromUnitId: 16,
    toUnitId: 2,
    factor: 29.574 },
  // g path
  { unitConversionId: 99997,
    fromUnitId: 3,
    toUnitId: 5,
    factor: 0.634,
    productId: 13 },            // 180 caps Micro-C
  { unitConversionId: 99999,
    fromUnitId: 1961,
    toUnitId: 5,
    factor: 3.600,
    productId: 21021 },         // 250 g Micro-C Immune Power
  // mg active ingredient paths
  { unitConversionId: 3521,
    fromUnitId: 5,
    toUnitId: 12,
    factor: 555.556,
    productId: 21021 },         // 250 g Micro-C Immune Power
  { unitConversionId: 99998,
    fromUnitId: 3,
    toUnitId: 12,
    factor: 500,
    productId: 13 },]);         // 180 caps Micro-C

export const units = new Units(selectUnits, selectDirectConversions);





