import { IOption, IUnit, IUnitConversion } from "@protoplan/types";
import Graph from 'node-dijkstra';

interface PathList
{
  [node: number]: number;
}

// Max 30
interface ProductGraphs
{
  [productId: number]: Graph
}

type SelectUnits = (filters?: { productId?: number, unitId?: number }) => Promise<IUnit[]>;
type SelectDirectConversions = (productId?: number) => Promise<IUnitConversion[]>;

export default class Units
{
  private genericUnits: IUnit[] = [];
  private genericDirectConversions: IUnitConversion[] = [];   // Max 50
  private genericGraph: Graph | undefined = undefined;
  private productGraphs: ProductGraphs = {};
  private selectUnits: SelectUnits = () => Promise.resolve([]);
  private selectDirectConversions: SelectDirectConversions = () => Promise.resolve([]);


  constructor(
    //genericUnits: IUnit[],
    //genericUnitConversions: IUnitConversion[],
    selectUnits: SelectUnits,
    selectDirectConversions: SelectDirectConversions)
  {
    this.selectUnits = selectUnits;
    this.selectDirectConversions = selectDirectConversions;
  }

  public async getUnit(unitId?: number)
  {
    let unit = this.genericUnits.find(u => u.unitId === unitId);
    if(!unit)
      unit = (await this.selectUnits({ unitId }))[0];

    return unit ? ({ ...unit }) : undefined;
  }

  public async getUnits(productId?: number)
  {
    const units = productId ? await this.selectUnits({ productId }) : this.genericUnits;

    return [...units.map(u => ({ ...u }))];
  }

  public getGenericDirectConversions()
  {
    return [...this.genericDirectConversions.map(u => ({ ...u }))];
  }

  public getFactor(fromUnitId: number, toUnitId: number, productIds?: number[])
  {
    if(fromUnitId === toUnitId)
      return 1;

    const path = this.getPath(fromUnitId, toUnitId, productIds);
    if(!path)
      return;

    let factor = 1;

    for(let i = 0; i < path.length - 1; ++i)
    {
      const directFactor = this.getDirectFactor(path[i], path[i + 1], productIds);
      if(!directFactor)
      {
        console.error(
          "No direct factor found " +
            "fromUnitId " + path[i] + " " +
            "toUnitId " + path[i + 1] + " " +
            "for productIds " + productIds + ". " +
          "Replacing with 1.");
      }

      factor = factor * (directFactor || 1);
    }

    return factor;
  }

  public async getUnitOption(unitId: number)
  {
    const unit = await this.getUnit(unitId);
    if(!unit)
      return;

    return ({ label: unit.name, value: unit.unitId });
  }

  public getUnitOptionsForProduct<T>(product: T & {
    productId: number,
    formId?: number,
    recDoseUnitId?: number,
    amountUnitId: number })
  {
    const recDoseUnitId = product.recDoseUnitId;
    const amountUnitId = product.amountUnitId;
    const productId = product.productId;
    const formId = product.formId;

    let validUnitIds = [amountUnitId];
    if(recDoseUnitId)
      validUnitIds.push(recDoseUnitId);

    // Same form
    if(formId)
      validUnitIds.push(...this.units.filter(u => u.formId === formId).map(u => u.unitId));

    // Appearing in product-specific unit conversions
    const unitConversions = this.directConversions.filter(c => c.productId === productId);
    validUnitIds.push(...unitConversions.map(c => c.fromUnitId));
    validUnitIds.push(...unitConversions.map(c => c.toUnitId));

    // Add common small measure volumes if any already exist
    const smalVolumeUnitIds = [2, 13, 30, 31, 33];
    if(!smalVolumeUnitIds.every(value => !validUnitIds.includes(value)))
      validUnitIds.push(...smalVolumeUnitIds);

    // Remove duplicates
    validUnitIds = validUnitIds.filter((id, i) => validUnitIds.indexOf(id) === i);

    let validUnitOptions: IOption[] = [];
    validUnitIds.forEach(unitId =>
    {
      // Check convertible with amountUnitId;
      const factor = this.getFactor(unitId, amountUnitId, [productId]);
      if(!factor)
        return;

      const option = this.getUnitOption(unitId);
      if(option)
        validUnitOptions.push(option);
    });

    return validUnitOptions.sort((a, b) => a.label.localeCompare(b.label));
  }

  private async getPath(fromUnitId: number, toUnitId: number, productIds?: number[])
  {
    if(fromUnitId === toUnitId)
      return [];

    const graph = productIds?.length ? await this.getProductGraph(productIds) : await this.getGenericGraph();

    const path = ((graph.path(fromUnitId.toString(), toUnitId.toString()) || []) as string[])
      .map(id => Number(id));

    if(path.length < 2)
      return;

    return path;
  }

  private async getProductGraph(productIds: number[])
  {
    let graph;

    if(productIds.length === 1)
      graph = this.productGraphs[productIds[0]];

    if(!graph)
    {
      graph = await this.buildGraph(productIds);

      if(productIds.length === 1)
        this.productGraphs[productIds[0]] = graph;
    }

    return graph;
  }

  private async buildGraph(productIds?: number[])
  {
    let graph = await this.getGenericGraph();

    if(!productIds?.length && graph)
      return graph;

    let units = this.genericUnits;
    if(productIds?.length)
    {
      for(const productId of productIds)
      {
        units.push(...await this.selectUnits({ productId }));
      }
    }

    for(const fromUnit of units)
    {
      const fromUnitId = fromUnit.unitId;
      let nodePaths: PathList = {};

      for(const toUnit of units)
      {
        const toUnitId = toUnit.unitId;

        let factor = await productIds?.reduce(
          async(fPromise, id) => await fPromise ? fPromise : this.getDirectFactor(fromUnitId, toUnitId, id),
          <Promise<undefined | number>>Promise.resolve(undefined));

        if(factor)
          nodePaths[toUnitId] = factor;
      };

      graph.addNode(fromUnitId.toString(), nodePaths);
    };

    return graph;
  }

  private async getGenericGraph()
  {
    if(!this.genericGraph)
    {
      this.genericUnits = await this.selectUnits();
      this.genericDirectConversions = await this.selectDirectConversions();
      this.genericGraph = new Graph();
    }

    return this.genericGraph;
  }

  // Search for direct unit conversion factor (returns 0 if none found)
  private async getDirectFactor(fromUnitId: number, toUnitId: number, productId?: number)
  {
    if(fromUnitId === toUnitId)
      return 1;

    let factor = await this.getExplicitDirectFactor(fromUnitId, toUnitId, productId);
    if(factor)
      return factor;

    // Unit conversions of fallback generic units with matching name
    const fromUnit = await this.getUnit(fromUnitId);
    const toUnit = await this.getUnit(toUnitId);
    const genericFromUnit: IUnit | undefined =
      this.genericUnits.filter(u => !u.productId && u.name === fromUnit?.name)[0];
    const genericToUnit: IUnit | undefined =
      this.genericUnits.filter(u => !u.productId && u.name === toUnit?.name)[0];

    factor = await this.getExplicitDirectFactor(
      genericFromUnit.unitId || fromUnitId,
      genericToUnit.unitId || toUnitId,
      productId);

    return factor;
  };

  private async getExplicitDirectFactor(fromUnitId: number, toUnitId: number, productId?: number)
  {
    let factor;

    // Prefer product-specific units
    if(productId)
    {
      for(const uc of await this.selectDirectConversions(productId))
      {
        factor = factorIfConversionMatches(uc, fromUnitId, toUnitId);
        if(factor)
          return factor;
      }
    }

    for(const uc of this.genericDirectConversions)
    {
      factor = factorIfConversionMatches(uc, fromUnitId, toUnitId);
      if(factor)
        return factor;
    }
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


