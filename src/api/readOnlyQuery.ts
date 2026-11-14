export function assertReadOnlyQuery(datalog: string): void {
  const query = datalog.trim();
  if (!query.startsWith("?")) {
    throw new Error("memory_query only accepts read-only CozoScript queries starting with ?");
  }
  if (/(^|\s):(put|rm|create|replace|delete|drop|alter|index|hnsw|fts|lsh|reindex|repair_corrupt|import|export|backup|restore)\b/i.test(query)) {
    throw new Error("memory_query rejected a mutating CozoScript statement");
  }
}
