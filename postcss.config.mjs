/**
 * PostCSS config for Tailwind 4 Oxide engine.
 * Next.js requires plugins as string names (not imported functions) —
 * see https://nextjs.org/docs/messages/postcss-shape.
 */
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
