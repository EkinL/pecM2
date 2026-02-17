export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }

  try {
    const runtimeRequire = Function('return require')() as NodeRequire;
    runtimeRequire.resolve('pino');
    runtimeRequire('next-logger');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'missing optional logger dependencies';
    console.warn(`[instrumentation] next-logger disabled: ${message}`);
  }
}
