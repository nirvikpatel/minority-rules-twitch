// Unit-test adapter only. Deployed builds use the actual cloudflare:workers module.
export class DurableObject<E> {
  constructor(protected ctx:DurableObjectState,protected env:E) {}
}
