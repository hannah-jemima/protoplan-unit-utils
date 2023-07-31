import {
  validDoseUnitOptionsForDosing,
  getUnitConversionFactor,
  TUnitConversionPath } from "./utils.js";



export declare interface TOption
{
  label: string;
  value: number;
  input?: string;
}

export { validDoseUnitOptionsForDosing as validDoseUnitOptionsForProtocolRow,
  getUnitConversionFactor,
  TUnitConversionPath }