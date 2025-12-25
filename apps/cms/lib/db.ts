/**
 * Resolves the correct table name based on the dataset environment.
 * 
 * @param baseName - The base name of the table (e.g., 'areas')
 * @param dataset - The dataset environment ('prod', 'dev', 'staging')
 * @returns The resolved table name (e.g., 'areas_dev')
 */
/**
 * Resolves the correct schema name based on the dataset environment.
 * 
 * @param dataset - The dataset environment ('prod', 'dev', 'staging')
 * @returns The resolved schema name ('prod', 'dev', 'staging')
 */
export function getDbSchema(dataset: string): string {
  switch (dataset) {
    case 'dev':
      return 'dev';
    case 'staging':
      return 'staging';
    case 'prod':
    default:
      return 'prod';
  }
}

/**
 * Returns the table name. Since we use schemas now, this just returns the base name.
 * Kept for backward compatibility/clarity.
 * 
 * @param baseName - The base name of the table
 * @returns The base name
 */
export function getTableName(baseName: string, _dataset: string): string {
  return baseName;
}

/**
 * Returns the RPC name. Since we use schemas now, this just returns the base name.
 * Kept for backward compatibility/clarity.
 * 
 * @param baseName - The base name of the RPC function
 * @returns The base name
 */
export function getRpcName(baseName: string, _dataset: string): string {
  return baseName;
}
