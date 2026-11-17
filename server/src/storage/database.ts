import mongoose from 'mongoose';
import { createState } from '../domain/state.ts';
import type { WorkspaceState } from '../shared/types.ts';

/** Record collections and the field each one is keyed by. */
const keys = {
  clients: 'id',
  stores: 'id',
  services: 'id',
  users: 'id',
  tickets: 'id',
  invoices: 'id',
  notifications: 'id',
  sessions: 'hash',
  publicGrants: 'hash',
} as const;
type CollectionKey = keyof typeof keys;
const collectionKeys = Object.keys(keys) as CollectionKey[];

interface StoredRecord {
  _id: string;
  order: number;
  data: Record<string, unknown>;
}
interface WorkspaceHead {
  _id: string;
  revision: number;
  metadata: Record<string, unknown>;
}
interface LegacyWorkspace {
  _id: string;
  state: WorkspaceState;
}
interface Baseline {
  revision: number;
  records: Record<CollectionKey, Map<string, string>>;
}

export interface WorkspaceStore {
  available: true;
  load(): Promise<WorkspaceState>;
  save(state: WorkspaceState): Promise<void>;
}
export type ConnectedStore = WorkspaceStore | { available: false };

const conflict = () =>
  Object.assign(Error('Workspace changed. Refresh and retry.'), { status: 409 });
const documentSchema = () =>
  new mongoose.Schema<StoredRecord>(
    { _id: String, order: Number, data: { type: mongoose.Schema.Types.Mixed, required: true } },
    { versionKey: false },
  );

/** Keep the domain's state interface while storing each record independently in MongoDB. */
export async function connectWorkspaceStore(
  uri: string | undefined,
  dbName?: string,
): Promise<ConnectedStore> {
  if (!uri) return { available: false };
  await mongoose.connect(uri, {
    ...(dbName ? { dbName } : {}),
    serverSelectionTimeoutMS: 10000,
    readPreference: 'primary',
  });
  const collections = Object.fromEntries(
    collectionKeys.map((key) => [
      key,
      (mongoose.models[`A2Z_${key}`] as mongoose.Model<StoredRecord> | undefined) ||
        mongoose.model<StoredRecord>(`A2Z_${key}`, documentSchema(), `a2z_${key}`),
    ]),
  ) as Record<CollectionKey, mongoose.Model<StoredRecord>>;
  const Head =
    (mongoose.models.A2ZWorkspaceHead as mongoose.Model<WorkspaceHead> | undefined) ||
    mongoose.model<WorkspaceHead>(
      'A2ZWorkspaceHead',
      new mongoose.Schema<WorkspaceHead>(
        { _id: String, revision: Number, metadata: mongoose.Schema.Types.Mixed },
        { versionKey: false },
      ),
      'a2z_workspace_head',
    );
  // Read the original single-document workspace on first use; the first write migrates it atomically.
  const Legacy =
    (mongoose.models.Workspace as mongoose.Model<LegacyWorkspace> | undefined) ||
    mongoose.model<LegacyWorkspace>(
      'Workspace',
      new mongoose.Schema<LegacyWorkspace>(
        { _id: String, state: mongoose.Schema.Types.Mixed },
        { versionKey: false },
      ),
      'workspaces',
    );
  await Promise.all([
    Head.init(),
    Legacy.init(),
    ...Object.values(collections).map((m) => m.init()),
  ]);
  const baselines = new WeakMap<WorkspaceState, Baseline>();
  function records(state: WorkspaceState, key: CollectionKey): Map<string, string> {
    const list = (state[key] || []) as unknown as Record<string, unknown>[];
    return new Map(list.map((record) => [record[keys[key]] as string, JSON.stringify(record)]));
  }
  const emptyRecords = () =>
    Object.fromEntries(collectionKeys.map((key) => [key, new Map()])) as Baseline['records'];

  async function load(): Promise<WorkspaceState> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const head = await Head.findById('main').lean();
      let state: WorkspaceState;
      if (!head) state = (await Legacy.findById('main').lean())?.state || createState();
      else {
        const entries = await Promise.all(
          collectionKeys.map(async (key) => [
            key,
            (await collections[key].find().sort({ order: 1 }).lean()).map((record) => record.data),
          ]),
        );
        state = {
          ...createState(),
          ...head.metadata,
          ...Object.fromEntries(entries),
        } as WorkspaceState;
      }
      const latest = await Head.findById('main').select('revision').lean();
      if (head?.revision !== latest?.revision) continue;
      baselines.set(state, {
        revision: head?.revision ?? 0,
        records: head
          ? (Object.fromEntries(
              collectionKeys.map((key) => [key, records(state, key)]),
            ) as Baseline['records'])
          : emptyRecords(),
      });
      return state;
    }
    throw conflict();
  }

  async function save(state: WorkspaceState): Promise<void> {
    const baseline = baselines.get(state);
    if (!baseline) throw Error('Load the workspace before saving.');
    const metadata = Object.fromEntries(
      Object.entries(state).filter(([key]) => !Object.hasOwn(keys, key)),
    );
    const current = Object.fromEntries(
      collectionKeys.map((key) => [key, records(state, key)]),
    ) as Baseline['records'];
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(
        async () => {
          const write = await Head.updateOne(
            { _id: 'main', revision: baseline.revision },
            { $inc: { revision: 1 }, $set: { metadata } },
            { upsert: baseline.revision === 0, session },
          );
          if (!write.matchedCount && !write.upsertedCount) throw conflict();
          for (const key of collectionKeys) {
            const model = collections[key];
            const previous = baseline.records[key];
            const next = current[key];
            const previousIds = [...previous.keys()];
            const nextIds = [...next.keys()];
            const orderChanged =
              previousIds.length !== nextIds.length ||
              previousIds.some((id, index) => id !== nextIds[index]);
            const operations: mongoose.AnyBulkWriteOperation<StoredRecord>[] = [];
            for (const id of previousIds)
              if (!next.has(id)) operations.push({ deleteOne: { filter: { _id: id } } });
            for (const [order, id] of nextIds.entries()) {
              if (typeof id !== 'string' || !id) throw Error(`Invalid ${key} identifier.`);
              const changed = previous.get(id) !== next.get(id);
              if (changed || orderChanged)
                operations.push({
                  updateOne: {
                    filter: { _id: id },
                    update: {
                      $set: {
                        order,
                        ...(changed ? { data: JSON.parse(next.get(id) as string) } : {}),
                      },
                    },
                    upsert: changed,
                  },
                });
            }
            if (operations.length) await model.bulkWrite(operations, { session });
          }
        },
        { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
      );
      baselines.set(state, { revision: baseline.revision + 1, records: current });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) throw conflict();
      throw error;
    } finally {
      await session.endSession();
    }
  }
  return { available: true, load, save };
}
