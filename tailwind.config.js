/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include any files that contain nativewind classes
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {},
  },
  plugins: [],
}
