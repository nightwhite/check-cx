export const MAX_D1_BATCH_STATEMENTS = 100;

export interface D1BatchExecutor {
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

export async function runD1Batches(
  db: D1BatchExecutor,
  statements: D1PreparedStatement[]
): Promise<void> {
  for (let index = 0; index < statements.length; index += MAX_D1_BATCH_STATEMENTS) {
    await db.batch(statements.slice(index, index + MAX_D1_BATCH_STATEMENTS));
  }
}
