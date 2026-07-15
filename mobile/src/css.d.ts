// Allow importing CSS and CSS-module files (handled by Metro at runtime).
declare module "*.css";
declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}
