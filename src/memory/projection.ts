// SPDX-License-Identifier: Apache-2.0

import type {
  Entity,
  Relation,
  GraphProjection,
  JSONValue,
} from "@danielsimonjr/memoryjs";
import { dict } from "../runtime/freeze";

/**
 * The flat view NC exposes to @json-ui/react's DataProvider via the
 * memoryjs ObservableDataModel adapter. Every field satisfies JSONValue
 * so DataProvider's useSyncExternalStore binding stays tearing-safe.
 *
 *   entitiesByType: grouped by entityType
 *   entities: keyed by entity name for O(1) lookup
 *   relations: projected edges (from, to, relationType)
 *   relationCount: scalar equal to relations.length
 *
 * This rebuilds both maps on every graph snapshot (O(entities + relations)).
 * Incremental projection would require memoryjs adapter support NC does
 * not own.
 */
export interface NCProjectedRelation {
  from: string;
  to: string;
  relationType: string;
  [key: string]: JSONValue;
}

export interface NCProjectedData {
  entitiesByType: Record<string, Array<NCProjectedEntity>>;
  entities: Record<string, NCProjectedEntity>;
  relations: Array<NCProjectedRelation>;
  relationCount: number;
  [key: string]: JSONValue;
}

export interface NCProjectedEntity {
  name: string;
  entityType: string;
  observations: string[];
  createdAt: string | null;
  lastModified: string | null;
  [key: string]: JSONValue;
}

function toProjected(entity: Entity): NCProjectedEntity {
  return {
    name: entity.name,
    entityType: entity.entityType,
    observations: [...entity.observations],
    createdAt: entity.createdAt ?? null,
    lastModified: entity.lastModified ?? null,
  };
}

/**
 * Default NC graph projection. Groups entities by type, indexes by name,
 * and projects relations. Duplicate entity names: last write wins, with
 * a console warning. Maps use null-prototype objects so LLM-controlled
 * names cannot pollute Object.prototype.
 */
export const defaultNCProjection: GraphProjection = (
  entities: ReadonlyArray<Entity>,
  relations: ReadonlyArray<Relation>,
): Record<string, JSONValue> => {
  const entitiesByType = dict<Array<NCProjectedEntity>>();
  const entitiesByName = dict<NCProjectedEntity>();
  for (const entity of entities) {
    const projected = toProjected(entity);
    if (Object.prototype.hasOwnProperty.call(entitiesByName, entity.name)) {
      console.warn(
        `[NC] defaultNCProjection: duplicate entity name "${entity.name}"; last write wins.`,
      );
    }
    entitiesByName[entity.name] = projected;
    const bucket = entitiesByType[entity.entityType] ?? [];
    bucket.push(projected);
    entitiesByType[entity.entityType] = bucket;
  }
  const projectedRelations: Array<NCProjectedRelation> = relations.map(
    (rel) => ({
      from: rel.from,
      to: rel.to,
      relationType: rel.relationType,
    }),
  );
  const result: NCProjectedData = {
    entitiesByType,
    entities: entitiesByName,
    relations: projectedRelations,
    relationCount: relations.length,
  };
  return result;
};
