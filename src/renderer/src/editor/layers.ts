import { Group, type FabricObject } from "fabric";
import { isFlattened } from "./flatten.ts";

export type LayerTreeRow = {
  object: FabricObject;
  depth: number;
  path: string;
};

export function isExpandableLayer(object: FabricObject) {
  return object instanceof Group && !isFlattened(object) && object.size() > 0;
}

export function layerTreeRows(
  objects: FabricObject[],
  expanded: ReadonlySet<FabricObject>,
) {
  const rows: LayerTreeRow[] = [];
  function visit(items: FabricObject[], depth: number, parentPath: string) {
    [...items].reverse().forEach((object, index) => {
      const path = parentPath ? `${parentPath}-${index}` : `${index}`;
      rows.push({ object, depth, path });
      if (expanded.has(object) && isExpandableLayer(object))
        visit((object as Group).getObjects(), depth + 1, path);
    });
  }
  visit(objects, 0, "");
  return rows;
}
