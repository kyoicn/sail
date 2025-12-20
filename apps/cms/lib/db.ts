/**
 * Resolves the correct table name based on the dataset environment.
 * 
 * @param baseName - The base name of the table (e.g., 'areas')
 * @param dataset - The dataset environment ('prod', 'dev', 'staging')
 * @returns The resolved table name (e.g., 'areas_dev')
 */
export function getTableName(baseName: string, dataset: string): string {
  let suffix = '';
  switch (dataset) {
    case 'dev':
      suffix = '_dev';
      break;
    case 'staging':
      suffix = '_staging';
      break;
    default:
      suffix = '';
  }
  return `${baseName}${suffix}`;
}

/**
 * Resolves the correct RPC function name based on the dataset environment.
 * 
 * @param baseName - The base name of the RPC function
 * @param dataset - The dataset environment ('prod', 'dev', 'staging')
 * @returns The resolved RPC name
 */
export function getRpcName(baseName: string, dataset: string): string {
  return getTableName(baseName, dataset);
}
