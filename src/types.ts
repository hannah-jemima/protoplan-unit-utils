

export interface TUnit
{
  unitId: number,
  name: string,
  formId: number
}

export type TUnits = TUnit[];


export interface TUnitConversion
{
  unitConversionId: number,
  productId: number,
  fromUnitId: number,
  toUnitId: number,
  factor: number
}

export type TUnitConversions = TUnitConversion[];


export interface TOption
{
  label: string;
  value: number;
  input?: string;
}
