import { describe, expect, it } from "vitest";
import { OpenAiInvy } from "../src/invy/brain";
import { GooglePlaces, PlacesError } from "../src/invy/places";
import { checkSite, fetchPage, isPrivateAddress, readHomepage } from "../src/invy/site-check";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const html = (body: string, status = 200, headers: Record<string, string> = {}) => new Response(body, { status, headers: { "content-type": "text/html", ...headers } });
const publicDns = async () => ["93.184.216.34"];

describe("Google Places client", () => {
  it("asks for the fields it needs, pages on, and maps the answer", async () => {
    let sent: { headers: Record<string, string>; body: { textQuery: string; pageToken?: string } } | null = null;
    const g = new GooglePlaces("gk", (async (_u: string, init?: RequestInit) => {
      sent = { headers: init!.headers as Record<string, string>, body: JSON.parse(String(init!.body)) };
      return json({
        places: [
          { id: "p1", displayName: { text: "Cafe One" }, formattedAddress: "1 MG Road", location: { latitude: 12.97, longitude: 77.59 }, primaryTypeDisplayName: { text: "Cafe" }, rating: 4.4, userRatingCount: 12, businessStatus: "OPERATIONAL", internationalPhoneNumber: "+91 80 1234 5678", googleMapsUri: "https://maps.google.com/?cid=1" },
          { id: "p2", displayName: { text: "No location" } },
        ],
        nextPageToken: "tok2",
      });
    }) as typeof fetch);
    const r = await g.search("cafes in Bangalore", "tok1");
    expect(sent!.headers["x-goog-api-key"]).toBe("gk");
    expect(sent!.headers["x-goog-fieldmask"]).toContain("places.websiteUri");
    expect(sent!.body).toMatchObject({ textQuery: "cafes in Bangalore", pageToken: "tok1", pageSize: 20 });
    expect(r).toEqual({
      next: "tok2",
      places: [{ placeId: "p1", name: "Cafe One", category: "Cafe", address: "1 MG Road", lat: 12.97, lng: 77.59, phone: "+91 80 1234 5678", website: null, mapsUrl: "https://maps.google.com/?cid=1", rating: 4.4, reviews: 12, businessStatus: "OPERATIONAL" }],
    });
  });
  it("explains a refused key", async () => {
    const g = new GooglePlaces("bad", (async () => json({ error: { message: "API key not valid" } }, 403)) as typeof fetch);
    await expect(g.search("x")).rejects.toThrow(PlacesError);
    await expect(g.search("x")).rejects.toThrow("GOOGLE_MAPS_API_KEY");
  });
});

describe("website checks", () => {
  it("never opens private or internal addresses", async () => {
    for (const ip of ["10.0.0.5", "127.0.0.1", "192.168.1.1", "172.20.1.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "::ffff:10.0.0.1"]) expect(isPrivateAddress(ip)).toBe(true);
    for (const ip of ["93.184.216.34", "8.8.8.8", "2606:4700::1111"]) expect(isPrivateAddress(ip)).toBe(false);
    const f = (async () => html("x")) as typeof fetch;
    await expect(fetchPage("http://intranet.local/", { fetch: f, resolve: async () => ["10.1.2.3"] })).rejects.toThrow("not a public address");
    await expect(fetchPage("file:///etc/passwd", { fetch: f, resolve: publicDns })).rejects.toThrow();
    // A redirect into the private network is refused too.
    const redirect = (async (u: URL) => (String(u).includes("start") ? html("", 302, { location: "http://169.254.169.254/latest" }) : html("secret"))) as unknown as typeof fetch;
    await expect(fetchPage("https://a.com/start", { fetch: redirect, resolve: async (h) => (h === "a.com" ? ["93.184.216.34"] : ["169.254.169.254"]) })).rejects.toThrow("not a public address");
  });

  it("reads what a homepage shows", () => {
    const page = `<html><head><title> Smile Dental | Mumbai </title><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="generator" content="WordPress 4.9"></head>
      <body><a href="https://www.practo.com/mumbai/clinic/smile">Book an appointment</a> <a href="mailto:hello@smiledental.in">Mail</a> info@smiledental.in logo@2x.png
      <footer>© 2017 - 2019 Smile Dental</footer><script>var x="noreply@sentry.io"</script></body></html>`;
    expect(readHomepage(page)).toEqual({ title: "Smile Dental | Mumbai", mobileFriendly: true, generator: "WordPress 4.9", copyrightYear: 2019, booking: "Practo booking", ordering: null, emails: ["hello@smiledental.in", "info@smiledental.in"], socials: [] });
    expect(readHomepage("<p>Order online now</p>")).toMatchObject({ mobileFriendly: false, booking: null, ordering: "online ordering", emails: [] });
  });

  it("finds the business's own social profiles, not share buttons", () => {
    const page = `<a href="https://www.instagram.com/smiledental/">IG</a> <a href="https://instagram.com/other">IG2</a>
      <a href="https://www.facebook.com/sharer/sharer.php?u=x">Share</a> <a href="https://www.facebook.com/SmileDentalMumbai">FB</a>
      <a href="https://twitter.com/intent/tweet?text=hi">Tweet</a> <a href="https://www.linkedin.com/company/smile-dental/">In</a>
      <a href="https://www.linkedin.com/shareArticle?url=x">Share</a> <a href="https://www.youtube.com/watch?v=abc">Video</a>
      <a href="https://wa.me/919876543210">WhatsApp</a> <a href='https://x.com/smiledental'>X</a>`;
    expect(readHomepage(page).socials).toEqual([
      { network: "instagram", url: "https://www.instagram.com/smiledental/" },
      { network: "facebook", url: "https://www.facebook.com/SmileDentalMumbai" },
      { network: "linkedin", url: "https://www.linkedin.com/company/smile-dental/" },
      { network: "whatsapp", url: "https://wa.me/919876543210" },
      { network: "x", url: "https://x.com/smiledental" },
    ]);
  });

  it("no website, social page, broken site, a working one (email from its contact page)", async () => {
    expect(await checkSite(null)).toMatchObject({ status: "none" });
    expect(await checkSite("https://www.instagram.com/cafe")).toMatchObject({ status: "social", socials: [{ network: "instagram", url: "https://www.instagram.com/cafe" }] });
    const f = (async (u: URL) => {
      const s = String(u);
      if (s.includes("down.in")) return html("nope", 503);
      if (s.endsWith("/contact")) return html('Write to us: owner@cafe.in <a href="https://www.instagram.com/cafe.in">Instagram</a>');
      return html('<meta name="viewport" content="width=device-width"><a href="/contact">Contact</a> © 2025');
    }) as unknown as typeof fetch;
    expect(await checkSite("https://down.in", { fetch: f, resolve: publicDns })).toMatchObject({ status: "broken", httpStatus: 503 });
    expect(await checkSite("https://cafe.in", { fetch: f, resolve: publicDns })).toMatchObject({ status: "ok", https: true, mobileFriendly: true, copyrightYear: 2025, emails: ["owner@cafe.in"], socials: [{ network: "instagram", url: "https://www.instagram.com/cafe.in" }] });
    expect(await checkSite("https://gone.in", { fetch: f, resolve: async () => Promise.reject(new Error("ENOTFOUND")) })).toMatchObject({ status: "broken", error: "DNS not found" });
  });
});

describe("Invy's AI", () => {
  const ai = (content: unknown) => new OpenAiInvy("k", "m", (async () => json({ choices: [{ message: { content: JSON.stringify(content) } }] })) as typeof fetch);
  it("returns valid criteria, or asks when it can't tell", async () => {
    const c = { category: "restaurants", location: "Bangalore, India", count: 50, website: "none", needs: [], minRating: null, queries: ["restaurants in Bangalore", "restaurants in Indiranagar, Bangalore"], offer: "website development" };
    expect(await ai({ criteria: c, reply: "Looking for restaurants without a website." }).understand([{ role: "user", text: "50 restaurants in Bangalore without websites" }], null)).toEqual({ criteria: c, reply: "Looking for restaurants without a website." });
    expect(await ai({ question: "Which city?" }).understand([{ role: "user", text: "find cafes" }], null)).toEqual({ question: "Which city?" });
    expect(await ai({ criteria: { ...c, count: 9999 } }).understand([], null)).toHaveProperty("question");
  });
  it("keeps only explanations for the businesses it was given", async () => {
    const r = await ai({ summary: "Found 1.", items: { b1: { why: "No website on its Google listing.", opportunity: "Website" }, ghost: { why: "x" } } }).explain(
      { category: "cafes", location: "Pune", count: 5, website: "none", needs: [], queries: ["cafes in Pune"] },
      [{ id: "b1", name: "A", category: null, rating: null, reviews: null, reasons: [] }],
      { checked: 20, matched: 1, wanted: 5 },
    );
    expect(r).toEqual({ summary: "Found 1.", items: { b1: { why: "No website on its Google listing.", opportunity: "Website" } } });
  });
});
