import { IOption, IUnit, IUnitConversion } from "@protoplan/types";
import Graph from 'node-dijkstra';

interface PathList
{
  [node: number]: number;
}

interface ProductGraphs
{
  [productId: number]: Graph
}

export default class Units
{
  private units: IUnit[] = [];
  private directConversions: IUnitConversion[] = [];
  private genericGraph: Graph = new Graph;
  private productGraphs: ProductGraphs = {};


  constructor(units: IUnit[], unitConversions: IUnitConversion[])
  {
    this.units = units;
    this.directConversions = unitConversions;
    this.genericGraph = this.buildGraph();
  }

  public getUnit(unitId: number)
  {
    const unit = this.units.find(u => u.unitId === unitId);
    return unit ? ({ ...unit }) : undefined;
  }

  public getUnits()
  {
    return [...this.units.map(u => ({ ...u }))];
  }

  public getUnitConversions()
  {
    return [...this.directConversions.map(u => ({ ...u }))];
  }

  public addUnits(units: IUnit[])
  {
    this.units.push(...units.filter(u => !this.units.map(u0 => u0.unitId).includes(u.unitId)));

    this.rebuildGraphs();
  }

  public removeUnits(unitIds: number[])
  {
    unitIds.forEach(id =>
    {
      const index = this.units.findIndex(u => u.unitId === id);
      if(!index)
        return

      this.units.splice(index, 1);
    });

    this.rebuildGraphs();
  }

  public addUnitConversions(unitConversions: IUnitConversion[])
  {
    this.directConversions.push(...unitConversions
      .filter(c => !this.directConversions.map(c0 => c0.unitConversionId).includes(c.unitConversionId)));

    this.rebuildGraphs();
  }

  public removeUnitConversions(unitConversionIds: number[])
  {
    unitConversionIds.forEach(id =>
    {
      const index = this.directConversions.findIndex(c => c.unitConversionId === id);
      if(!index)
        return

      this.directConversions.splice(index, 1);
    });

    this.rebuildGraphs();
  }

  public getFactor(fromUnitId: number, toUnitId: number, productId?: number)
  {
    if(fromUnitId === toUnitId)
      return 1;

    const path = this.getPath(fromUnitId, toUnitId, productId);
    if(!path)
      return;

    let factor = 1;

    for(let i = 0; i < path.length - 1; ++i)
    {
      const directFactor = this.getDirectFactor(path[i], path[i + 1], productId);
      if(!directFactor)
      {
        console.error(
          "No direct factor found " +
            "fromUnitId " + path[i] + " " +
            "toUnitId " + path[i + 1] + " " +
            "for productId " + productId + ". " +
          "Replacing with 1.");
      }

      factor = factor * (directFactor || 1);
    }

    return factor;
  }

  public getUnitOption(unitId: number)
  {
    const unit = this.getUnit(unitId);
    if(!unit)
      return;

    return ({ label: unit.name, value: unit.unitId });
  }

  public getUnitOptionsForProduct<T>(product: T & {
    productId: number,
    formId: number,
    recDoseUnitId?: number,
    amountUnitId: number })
  {
    const recDoseUnitId = product.recDoseUnitId;
    const amountUnitId = product.amountUnitId;
    const productId = product.productId;

    let validUnitIds = [amountUnitId];
    if(recDoseUnitId)
      validUnitIds.push(recDoseUnitId);

    // Same form
    validUnitIds.push(...this.units.filter(u => u.formId === product.formId).map(u => u.unitId));

    // Appearing in product-specific unit conversions
    const unitConversions = this.directConversions.filter(c => c.productId === productId);
    validUnitIds.push(...unitConversions.map(c => c.fromUnitId));
    validUnitIds.push(...unitConversions.map(c => c.toUnitId));

    // Remove duplicates
    validUnitIds = validUnitIds.filter((id, i) => validUnitIds.indexOf(id) === i);

    let validUnitOptions: IOption[] = [];
    validUnitIds.forEach(unitId =>
    {
      // Check convertible with amountUnitId;
      const factor = this.getFactor(unitId, amountUnitId, productId);
      if(!factor)
        return;

      const option = this.getUnitOption(unitId);
      if(option)
        validUnitOptions.push(option);
    });

    return validUnitOptions.sort((a, b) => a.label.localeCompare(b.label));
  }

  private rebuildGraphs()
  {
    this.genericGraph = this.buildGraph();

    const productIds = Object.keys(this.productGraphs).map(id => Number(id));

    productIds.forEach(id =>
    {
      this.productGraphs[id] = this.buildGraph(id);
    })
  }

  private getPath(fromUnitId: number, toUnitId: number, productId?: number)
  {
    if(fromUnitId === toUnitId)
      return [];

    const graph = productId ? this.getProductGraph(productId) : this.genericGraph;

    const path = ((graph.path(fromUnitId.toString(), toUnitId.toString()) || []) as string[])
      .map(id => Number(id));

    if(path.length < 2)
      return;

    return path;
  }

  private getProductGraph(productId: number)
  {
    if(!this.productGraphs[productId])
      this.productGraphs[productId] = this.buildGraph(productId);

    return this.productGraphs[productId];
  }

  private buildGraph(productId?: number)
  {
    const route = new Graph();

    this.units.forEach((fromUnit: IUnit) =>
    {
      const fromUnitId = fromUnit.unitId;
      let nodePaths: PathList = {};

      this.units.forEach((toUnit: IUnit) =>
      {
        const toUnitId = toUnit.unitId;

        // Prefer product-specific unit unit conversions
        let factor = this.getDirectFactor(fromUnitId, toUnitId, productId);
        if(factor)
        {
          nodePaths[toUnitId] = factor;
          return;
        }

        factor = this.getDirectFactor(fromUnitId, toUnitId);
        if(factor)
          nodePaths[toUnitId] = factor;
      });

      route.addNode(fromUnitId.toString(), nodePaths);
    });

    return route;
  }

  // Search for direct unit conversion factor (returns 0 if none found)
  private getDirectFactor(fromUnitId: number, toUnitId: number, productId?: number)
  {
    if(fromUnitId === toUnitId)
      return 1;

    const searchUnitConversions = (productId0?: number) =>
    {
      const unitConversions = this.directConversions
        .filter(uc => productId0 ? uc.productId === productId0 : uc.productId === undefined)

      let factor;

      for(const uc of unitConversions)
      {
        factor = factorIfConversionMatches(uc, fromUnitId, toUnitId);
        if(factor)
          return factor;
      }
    };

    let factor;

    // Prefer product-specific unit conversion
    if(productId)
      factor = searchUnitConversions(productId);

    // Fall back to a default unit conversion
    if(!factor)
      factor = searchUnitConversions();

    return factor;
  };

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

  if(fromUnitId === from && toUnitId === to)
    return factor;
  else if(toUnitId === from && fromUnitId === to)
    return 1.0 / factor;
  else
    return;
}


