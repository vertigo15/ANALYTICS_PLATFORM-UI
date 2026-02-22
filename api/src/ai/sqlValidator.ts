export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export function validateSQL(sql: string): ValidationResult {
  const trimmed = sql.trim();

  // Check 1: Must not be empty
  if (!trimmed) {
    return { valid: false, reason: 'SQL query is empty' };
  }

  // Check 2: Maximum length
  if (trimmed.length > 5000) {
    return { valid: false, reason: 'SQL query exceeds maximum length of 5000 characters' };
  }

  // Check 3: Must be a single statement (no semicolons except optionally at end)
  const withoutTrailingSemicolon = trimmed.replace(/;$/, '');
  if (withoutTrailingSemicolon.includes(';')) {
    return { valid: false, reason: 'Multiple SQL statements are not allowed' };
  }

  // Check 4: Must start with SELECT
  if (!/^SELECT\s+/i.test(trimmed)) {
    return { valid: false, reason: 'Only SELECT queries are allowed' };
  }

  // Check 5: Must not contain dangerous keywords
  const dangerousKeywords = [
    'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER',
    'TRUNCATE', 'GRANT', 'REVOKE', 'EXECUTE', 'COPY', 'EXEC'
  ];

  const upperSQL = trimmed.toUpperCase();
  for (const keyword of dangerousKeywords) {
    // Use word boundary to avoid false positives (e.g., "INSERTED_AT" should be OK)
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(upperSQL)) {
      return { valid: false, reason: `${keyword} statements are not allowed` };
    }
  }

  // Check 6: Must not contain SQL comments
  if (trimmed.includes('--') || trimmed.includes('/*') || trimmed.includes('*/')) {
    return { valid: false, reason: 'SQL comments are not allowed for security reasons' };
  }

  // Check 7: Must only reference gold schema
  const schemaPattern = /\b(bronze|silver|control|public)\./i;
  if (schemaPattern.test(trimmed)) {
    return { valid: false, reason: 'Only gold schema tables are allowed. References to bronze, silver, control, or public schemas are not permitted.' };
  }

  // Check 8: If schema is explicitly referenced, must be gold
  const explicitSchemaPattern = /FROM\s+(\w+)\./i;
  const matches = trimmed.match(explicitSchemaPattern);
  if (matches && matches[1].toLowerCase() !== 'gold') {
    return { valid: false, reason: `Schema '${matches[1]}' is not allowed. Only 'gold' schema is permitted.` };
  }

  // Check 9: Detect subquery schema violations
  const subqueryPattern = /\(\s*SELECT.*?FROM\s+(\w+)\./gi;
  let match;
  while ((match = subqueryPattern.exec(trimmed)) !== null) {
    if (match[1].toLowerCase() !== 'gold') {
      return { valid: false, reason: `Subquery references disallowed schema '${match[1]}'. Only 'gold' schema is permitted.` };
    }
  }

  return { valid: true };
}

export function injectLimitAndFilters(sql: string, limit: number = 500): string {
  // Add LIMIT if not present
  if (!/LIMIT\s+\d+/i.test(sql)) {
    sql = sql.trim().replace(/;$/, '') + ` LIMIT ${limit}`;
  }

  return sql;
}
