// Lets Node tests import renderer modules (ui/**/*.ts) as the app ships
// them: Node strips the types, and this resolves their extensionless
// relative imports the way Vite does. Import it first, then load renderer
// modules with a dynamic import().
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (!specifier.startsWith(".") || /\.[cm]?[jt]sx?$/.test(specifier))
        throw error;
      return next(`${specifier}.ts`, context);
    }
  },
});
