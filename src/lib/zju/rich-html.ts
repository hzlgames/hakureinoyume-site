import sanitize from "sanitize-html";

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}
// Retain question formatting and images without allowing active page content.
export function safeRichHtml(value: string) {
  return sanitize(value, {
    allowedTags: [...sanitize.defaults.allowedTags, "img"],
    allowedAttributes: { ...sanitize.defaults.allowedAttributes, img: ["src", "alt", "width", "height"] },
    allowedSchemes: ["http", "https"],
    transformTags: { img: (_tag, attrs) => ({ tagName: "img", attribs: { ...attrs, src: new URL(attrs.src || "", "https://courses.zju.edu.cn").href } }) }
  });
}
