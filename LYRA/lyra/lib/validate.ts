import type { ZodType } from 'zod'

// Thrown by parseBody on a failed/malformed request body. Routes catch this the
// same way they already catch the auth sentinel (`error.message === 'Unauthorized'`)
// -- see any route's catch block for the pattern. Message is deliberately generic;
// the field-level Zod issues are for server logs only, not the client response
// (same reasoning as the H15/M7 fixes: never reflect internal validation detail
// a client didn't need to know beyond "this field is wrong").
export class ValidationError extends Error {
  issues: string[]
  constructor(issues: string[]) {
    super('Invalid request body')
    this.name = 'ValidationError'
    this.issues = issues
  }
}

/** Parses and validates a request's JSON body against a Zod schema, or throws ValidationError. */
export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let json: unknown
  try {
    json = await req.json()
  } catch {
    throw new ValidationError(['Body must be valid JSON'])
  }

  const result = schema.safeParse(json)
  if (!result.success) {
    throw new ValidationError(result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`))
  }
  return result.data
}
