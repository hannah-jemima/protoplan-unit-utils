import {
  validDoseUnitOptionsForProtocolRow,
  getUnitConversionFactor,
  TUnitConversionPath } from "./utils.js";



export declare interface TOption
{
  label: string;
  value: number;
  input?: string;
}

export { validDoseUnitOptionsForProtocolRow,
  getUnitConversionFactor,
  TUnitConversionPath }