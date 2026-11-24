export function assessmentRpcErrorStatus(code?: string | null): number {
  if (!code) return 500;
  switch (code) {
    case '42501': return 403;
    case 'P0002': return 404;
    case '23505': return 409;
    case '22023':
    case '22P02':
    case '23502':
    case '23503':
    case '23514':
      return 400;
    default:
      return 500;
  }
}
