import type {
  Entity,
  Relation,
  GraphProjection,
  JSONValue,
} from "@danielsimonjr/memoryjs";

/**
 * The flat view NC exposes to @json-ui/react's DataProvider via the
 * memoryjs ObservableDataModel adapter. Every field satisfies JSONValue
 * so DataProvider's useSyncExternalStore binding stays tearing-safe.
 *
 *   entitiesByType: grouped by entityType, used by the LLM to list
 *     "all users", "all messages", etc. in display components.
 *   entities: keyed by entity name for O(1) lookup from catalog
 *     actions that reference a specific durable path.
 *   relationCount: exposed as a simple scalar for diagnostic display.
 *     Full relation projection is deferred to a later NC sub-spec.
 */
export interface NCProjectedData {
  entitiesByType: Record<string, Array<NCProjectedEntity>>;
  entities: Record<string, NCProjectedEntity>;
  relationCount: number;
  [key: string]: JSONValue;
}

export interface NCProjectedEntity {
  name: string;
  entityType: string;
  observations: string[];
  createdAt: string;
  lastModified: string;
  [key: string]: JSONValue;
}

function toProjected(entity: Entity): NCProjectedEntity {
  return {
    name: entity.name,
    entityType: entity.entityType,
    observations: [...entity.observations],
    createdAt: entity.createdAt ?? "",
    lastModified: entity.lastModified ?? "",
  };
}

/**
 * Default NC graph projection. Groups entities by type and builds an
 * O(1) name-indexed map. Relations are counted but not projected —
 * the first iteration of NC does not need relation data in the React
 * tree. Bigger projections can be added later as NC grows.
 *
 * Pure function of its inputs so it is easy to test without standing
 * up a real memoryjs ManagerContext.
 */
export const defaultNCProjection: GraphProjection = (
  entities: ReadonlyArray<Entity>,
  relations: ReadonlyArray<Relation>,
): Record<string, JSONValue> => {
  const entitiesByType: Record<string, Array<NCProjectedEntity>> = {};
  const entitiesByName: Record<string, NCProjectedEntity> = {};
  for (const entity of entities) {
    const projected = toProjected(entity);
    entitiesByName[entity.name] = projected;
    const bucket = entitiesByType[entity.entityType] ?? [];
    bucket.push(projected);
    entitiesByType[entity.entityType] = bucket;
  }
  const result: NCProjectedData = {
    entitiesByType,
    entities: entitiesByName,
    relationCount: relations.length,
  };
  return result;
};
