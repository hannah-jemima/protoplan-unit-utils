import Graph from 'node-dijkstra';
import { TUnit, TUnitConversions, TUnits } from "@protoplan/types";
import { TOption } from '.';


const storedUnitConversionPaths: TUnitConversionPath[] = [];


export function validDoseUnitOptionsForDosing(
  units: TUnits,
  unitConversions: TUnitConversions,
  dosing: {
    productId: number,
    formId: number,
    recDoseUnitId?: number | null,
    amountUnitId: number }): { unitOptions: TOption[], newFormId: undefined | number }
{
  const productId = dosing.productId;
  const recDoseUnitId = dosing.recDoseUnitId;
  const amountUnitId = dosing.amountUnitId;
  const baseUnitId = recDoseUnitId || amountUnitId;

  const getUnit = (unitId: number) => units.filter(unit => unit.unitId === unitId)[0];
  const unitOptionFromUnit = (unit: TUnit) => ({ label: unit.name, value: unit.unitId });
  const unitOptionFromId = (unitId: number) => unitOptionFromUnit(getUnit(unitId));
  const checkForUnitConversionPath = (fromUnitId: number, toUnitId: number = baseUnitId): boolean =>
  {
    const storedPaths = storedUnitConversionPaths.filter(
      ucPath => ucPath.fromUnitId === fromUnitId && ucPath.toUnitId === toUnitId);

    if(!storedPaths.length)
      tryFindPath(fromUnitId, toUnitId, [productId], units, unitConversions);

    const storedPath = storedUnitConversionPaths.find(
      ucPath => ucPath.fromUnitId === fromUnitId && ucPath.toUnitId === toUnitId);

    return Boolean(storedPath);
  };

  let validUnits: TOption[] = [];

  // Check for uc path & add to valid unit options
  const addToValidUnits = (unitIds: number[]) =>
  {
    unitIds.forEach(unitId =>
    {
      if(
        !validUnits.filter(unitOption => unitOption.value === unitId).length &&     // if not already added
        (unitId === baseUnitId || checkForUnitConversionPath(unitId, baseUnitId)))  // if uc path available
      {
        validUnits.push(unitOptionFromId(unitId));
      }
    });
  };

  addToValidUnits([amountUnitId]);
  if(recDoseUnitId)
    addToValidUnits([recDoseUnitId]);

  // Determine form
  let newFormId: number | undefined = undefined;
  if(!dosing.formId)
  {
    dosing.formId = units.filter(unit => unit.unitId === baseUnitId)[0]?.formId;

    if(dosing.formId)
    {
      newFormId = dosing.formId;
    }
  }

  // Add relevant units for form
  switch(dosing.formId)
  {
  case 1: // capsules
    addToValidUnits([3, 5, 6]);
    break;
  case 2: // liquids
    addToValidUnits([2, 8, 9, 13, 30]);
    break;
  case 3: // solids
    addToValidUnits([5, 17]);
  }

  // Add any product-specific unit conversions
  const productSpecificUnitConversions = unitConversions
    .filter(uc => uc.productId === productId);
  addToValidUnits(productSpecificUnitConversions.map(uc => uc.toUnitId)
    .concat(productSpecificUnitConversions.map(uc => uc.fromUnitId)));

  return { unitOptions: validUnits.sort((a, b) => a.label.localeCompare(b.label)), newFormId };
}

interface TPathList
{
  [node: number]: number;
}

export interface TUnitConversionPath
{
  fromUnitId: number,
  toUnitId: number,
  path: number[] | null
}


// Search for direct unit conversion factor (returns 0 if none found)
const findConversionFactor = (
  fromUnitId: number,
  toUnitId: number,
  unitConversions: TUnitConversions,
  productIds?: (number | null)[]) =>
{
  let factor = 0;

  const searchUnitConversions = (productIds?: (number | null)[]) =>
  {
    unitConversions
      .filter(uc => productIds ?
        !productIds.every(productId => uc.productId !== productId) :
        uc.productId === null)
      .every(uc =>
      {
        factor = (factor || 1) * factorIfConversionMatches(uc, fromUnitId, toUnitId);
        if(factor)
          return false;
        return true;
      });
  };

  // Prefer product-specific unit conversion
  if(productIds?.length)
    searchUnitConversions(productIds);

  // Fall back to a default unit conversion
  if(!factor)
    searchUnitConversions();

  return factor;
};


function buildGraph(units: TUnits, unitConversions: TUnitConversions, productIds?: (number | null)[])
{
  const route = new Graph();

  units.forEach((fromUnit: TUnit) =>
  {
    const fromUnitId = fromUnit.unitId;
    let nodePaths: TPathList = {};

    units.forEach((toUnit: TUnit) =>
    {
      const toUnitId = toUnit.unitId;

      // Prefer product-specific unit unit conversions
      if(findConversionFactor(fromUnitId, toUnitId, unitConversions, productIds))
        nodePaths[toUnitId] = 1;
      else if(findConversionFactor(fromUnitId, toUnitId, unitConversions))
        nodePaths[toUnitId] = 2;

      route.addNode(fromUnitId.toString(), nodePaths);
    });
  });

  return route;
}


function tryFindPath(
  fromUnitId: number,
  toUnitId: number,
  productIds: (number | null)[],
  units: TUnits,
  unitConversions: TUnitConversions): number[] | null
{
  let path: number[] | null = storedUnitConversionPaths
    .filter(ucPath => ucPath.fromUnitId === fromUnitId && ucPath.toUnitId === toUnitId)[0]?.path || null;

  if(path)
    return path;

  try
  {
    const productGraph = buildGraph(units, unitConversions, productIds);
    path = (productGraph.path(fromUnitId.toString(), toUnitId.toString()) as string[]).map(id => Number(id));
    path = path?.map(unitId => typeof unitId === "string" ? parseFloat(unitId) : unitId) || null;
  }
  catch
  {
    return null;
  }

  // Store new path
  storedUnitConversionPaths.push({ fromUnitId, toUnitId, path });

  return path;
}


export function getUnitConversionFactor(
  fromUnitId: number,
  toUnitId: number,
  productIds: number[],
  units: TUnits,
  unitConversions: TUnitConversions)
{
  // No conversion necessary, return a *1 conversion factor
  if (toUnitId === fromUnitId)
    return 1;

  const path = tryFindPath(fromUnitId, toUnitId, productIds, units, unitConversions);

  let factor = 0;

  if(path)
  {
    factor = 1;

    for(let i = 0; i < path.length - 1; ++i)
    {
      factor *= findConversionFactor(
        path[i],
        path[i + 1],
        unitConversions,
        productIds);
    }
  }

  return factor;
}

// Returns the unit conversion factor if the conversion matches the to/fromUnits
function factorIfConversionMatches(
  conversion: { fromUnitId: number, toUnitId: number, factor: number },
  fromUnitId: number,
  toUnitId: number)
{
  const from = conversion.fromUnitId;
  const to = conversion.toUnitId;
  const factor = conversion.factor;

  if(
    typeof from === undefined ||
    typeof to === undefined ||
    typeof factor === undefined)
  {
    console.log("Error: cannot test an incomplete unit conversion factor");
    return 0;
  }

  if (fromUnitId === from)
  {
    if (toUnitId === to)
      return <number>factor;
  }
  else if (toUnitId === from)
  {
    if (fromUnitId === to)
      return 1.0 / <number>factor;
  }

  return 0;
}
