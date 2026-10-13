import { FabricObject } from "fabric";

const FLATTENED_ID_PREFIX = "easy-svg-flattened-";

type FlattenedObject = FabricObject & {
  flattened?: boolean;
  id?: string;
};

FabricObject.customProperties = [
  ...new Set([...FabricObject.customProperties, "flattened", "id", "name"]),
];

export function isFlattened(object: FabricObject | null) {
  return Boolean((object as FlattenedObject | null)?.flattened);
}

export function markFlattened(object: FabricObject) {
  const named = object as FlattenedObject;
  Object.assign(object, {
    flattened: true,
    id:
      typeof named.id === "string" && named.id.startsWith(FLATTENED_ID_PREFIX)
        ? named.id
        : `${FLATTENED_ID_PREFIX}${crypto.randomUUID()}`,
  });
  return object;
}

export function restoreFlattened(element: Element, object: FabricObject) {
  const named = object as FlattenedObject;
  if (
    element.id.startsWith(FLATTENED_ID_PREFIX) ||
    (typeof named.id === "string" && named.id.startsWith(FLATTENED_ID_PREFIX))
  ) {
    named.flattened = true;
  }
}
