export async function resolve(specifier, context, next) {
  const relative = specifier.startsWith("./") || specifier.startsWith("../");
  if (relative && !/\.[cm]?js$/.test(specifier)) return next(`${specifier}.js`, context);
  return next(specifier, context);
}
