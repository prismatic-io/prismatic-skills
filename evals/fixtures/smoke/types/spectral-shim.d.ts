// Shorthand ambient modules: every import (named/default/namespace) resolves
// to `any`. This lets generated Prismatic component code type-check with `tsc`
// WITHOUT the real @prismatic-io/spectral package installed — catching syntax
// errors and broken local types that grep-based checks miss, while not failing
// on the (unresolvable, here) spectral API surface.
declare module "@prismatic-io/spectral";
declare module "@prismatic-io/spectral/dist/clients/http";
declare module "@prismatic-io/spectral/*" {
  const value: any;
  export default value;
}
