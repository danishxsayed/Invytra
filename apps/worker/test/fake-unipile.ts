/** A tiny in-memory stand-in for Unipile's API, for tests (pass `fake.fetch` to UnipileClient). */
export interface FakePerson {
  slug: string;
  providerId: string;
  first: string;
  last: string;
  headline?: string;
  distance?: "FIRST_DEGREE" | "SECOND_DEGREE" | "THIRD_DEGREE";
  premium?: boolean;
  posts?: string[];
  /** Shared with connections only (LinkedIn hides it from everyone else). */
  email?: string;
}

export class FakeUnipile {
  people = new Map<string, FakePerson>();
  /** Replaces the search answer (e.g. a full page whose total is left empty, as LinkedIn often does). */
  searchAnswer: unknown = null;
  invites: { id: string; providerId: string; message?: string }[] = [];
  chats: { id: string; providerId: string; name: string; messages: { id: string; text: string; ts: string; mine: boolean }[] }[] = [];
  reactions: string[] = [];
  /** Sponsored messages (ads) in the inbox: nobody can reply to them. */
  ads: { id: string; subject: string }[] = [];
  comments: { post: string; text: string }[] = [];
  visits: string[] = [];
  /** Requests seen, "METHOD /path". */
  calls: string[] = [];
  /** Make every call answer 401 disconnected. */
  disconnected = false;
  /** Reject invites carrying a note with 422 (free account out of notes). */
  rejectNotes = false;
  /** Images sent with a new message (handwritten cards). */
  attachments: { providerId: string; type: string; bytes: number }[] = [];
  /** Voice messages sent. */
  voiceMessages: { providerId: string; type: string; bytes: number }[] = [];
  /** Make sending a voice message fail. */
  failVoice = false;
  private n = 0;

  add(p: FakePerson) {
    this.people.set(p.slug, p);
    return p;
  }

  private find(id: string) {
    return this.people.get(id) ?? [...this.people.values()].find((p) => p.providerId === id);
  }

  fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const method = init?.method ?? "GET";
    const path = url.pathname;
    this.calls.push(`${method} ${path}`);
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (this.disconnected) return json(401, { type: "errors/disconnected_account", title: "Disconnected" });
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body instanceof FormData ? Object.fromEntries(init.body as unknown as Iterable<[string, string]>) : {};
    let m: RegExpExecArray | null;

    if (method === "GET" && path === "/api/v1/users/me") return json(200, { first_name: "Me", last_name: "Myself", public_identifier: "me", premium: true, profile_picture_url: null });
    if (method === "GET" && path === "/api/v1/users/invite/sent") {
      return json(200, { items: this.invites.map((i) => ({ id: i.id, invited_user_id: i.providerId })), cursor: null });
    }
    if (method === "DELETE" && (m = /^\/api\/v1\/users\/invite\/sent\/(.+)$/.exec(path))) {
      this.invites = this.invites.filter((i) => i.id !== m![1]);
      return json(200, {});
    }
    if (method === "POST" && path === "/api/v1/users/invite") {
      if (this.rejectNotes && body.message) return json(422, { type: "errors/cannot_resend_yet", detail: "Custom message limit" });
      if (this.invites.some((i) => i.providerId === body.provider_id)) return json(422, { type: "errors/already_invited_recently", detail: "Already invited" });
      this.invites.push({ id: `inv${++this.n}`, providerId: body.provider_id, message: body.message });
      return json(201, { invitation_id: `inv${this.n}` });
    }
    if (method === "GET" && (m = /^\/api\/v1\/users\/([^/]+)\/posts$/.exec(path))) {
      const p = this.find(decodeURIComponent(m[1]!));
      if (!p) return json(404, { type: "errors/resource_not_found" });
      return json(200, { items: (p.posts ?? []).map((id) => ({ id, social_id: `urn:li:activity:${id}` })) });
    }
    if (method === "GET" && (m = /^\/api\/v1\/users\/([^/]+)$/.exec(path))) {
      const p = this.find(decodeURIComponent(m[1]!));
      if (!p) return json(404, { type: "errors/resource_not_found" });
      if (url.searchParams.get("notify") === "true") this.visits.push(p.slug);
      const pending = this.invites.some((i) => i.providerId === p.providerId);
      return json(200, {
        provider_id: p.providerId,
        public_identifier: p.slug,
        first_name: p.first,
        last_name: p.last,
        headline: p.headline ?? "",
        network_distance: p.distance ?? "SECOND_DEGREE",
        is_premium: !!p.premium,
        is_relationship: p.distance === "FIRST_DEGREE",
        contact_info: { emails: p.distance === "FIRST_DEGREE" && p.email ? [p.email] : [] },
        profile_picture_url: `https://media.licdn.com/dms/image/${p.slug}.jpg?e=2000000000&t=x`,
        ...(pending && { invitation: { type: "SENT", status: "PENDING" } }),
      });
    }
    if (method === "POST" && path === "/api/v1/posts/reaction") {
      this.reactions.push(body.post_id);
      return json(201, {});
    }
    if (method === "POST" && (m = /^\/api\/v1\/posts\/(.+)\/comments$/.exec(path))) {
      this.comments.push({ post: decodeURIComponent(m[1]!), text: body.text });
      return json(201, {});
    }
    if (method === "POST" && path === "/api/v1/chats") {
      const p = this.find(String(body.attendees_ids));
      if (!p || p.distance !== "FIRST_DEGREE") return json(422, { type: "errors/no_connection_with_recipient" });
      let chat = this.chats.find((c) => c.providerId === p.providerId);
      if (!chat) this.chats.push((chat = { id: `chat${++this.n}`, providerId: p.providerId, name: `${p.first} ${p.last}`, messages: [] }));
      const att = body.attachments as unknown;
      if (att instanceof Blob) this.attachments.push({ providerId: p.providerId, type: att.type, bytes: (await att.arrayBuffer()).byteLength });
      const vm = body.voice_message as unknown;
      if (this.failVoice && vm instanceof Blob) return json(500, { type: "errors/unexpected", title: "voice failed" });
      if (vm instanceof Blob) this.voiceMessages.push({ providerId: p.providerId, type: vm.type, bytes: (await vm.arrayBuffer()).byteLength });
      chat.messages.push({ id: `msg${++this.n}`, text: String(body.text ?? ""), ts: new Date(Date.now() + this.n).toISOString(), mine: true });
      return json(201, { chat_id: chat.id });
    }
    if (method === "POST" && (m = /^\/api\/v1\/chats\/([^/]+)\/messages$/.exec(path))) {
      const chat = this.chats.find((c) => c.id === m![1]);
      if (!chat) return json(404, { type: "errors/resource_not_found" });
      chat.messages.push({ id: `msg${++this.n}`, text: String(body.text), ts: new Date(Date.now() + this.n).toISOString(), mine: true });
      return json(201, {});
    }
    if (method === "GET" && path === "/api/v1/chats") {
      return json(200, {
        items: [
          ...this.chats.map((c) => ({ id: c.id, name: null, type: 0, timestamp: c.messages.at(-1)?.ts, unread_count: c.messages.at(-1)?.mine ? 0 : 1 })),
          ...this.ads.map((a) => ({ id: a.id, name: a.subject, type: 0, read_only: 1, content_type: "sponsored", disabledFeatures: ["reply"], timestamp: new Date().toISOString() })),
        ],
      });
    }
    if (method === "GET" && (m = /^\/api\/v1\/chats\/([^/]+)\/attendees$/.exec(path))) {
      const chat = this.chats.find((c) => c.id === m![1]);
      return json(200, { items: chat ? [{ id: "me", name: "Me", is_self: 1 }, { id: chat.providerId, provider_id: chat.providerId, name: chat.name, is_self: 0 }] : [] });
    }
    if (method === "GET" && (m = /^\/api\/v1\/chats\/([^/]+)\/messages$/.exec(path))) {
      const chat = this.chats.find((c) => c.id === m![1]);
      return json(200, { items: [...(chat?.messages ?? [])].reverse().map((x) => ({ id: x.id, text: x.text, timestamp: x.ts, is_sender: x.mine ? 1 : 0 })) });
    }
    if (method === "POST" && path === "/api/v1/linkedin/search") {
      if (this.searchAnswer) return json(200, this.searchAnswer);
      const people = [...this.people.values()];
      return json(200, {
        items: people.map((p) => ({ type: "PEOPLE", id: p.providerId, public_identifier: p.slug, name: `${p.first} ${p.last} • 2nd`, headline: p.headline, location: "Pune", network_distance: "DISTANCE_2", premium: !!p.premium, profile_picture_url: `https://media.licdn.com/dms/image/${p.slug}-s.jpg` })),
        paging: { total_count: people.length },
      });
    }
    return json(404, { type: "errors/not_found", detail: `${method} ${path}` });
  };

  /** Someone writes to us. */
  receive(slug: string, text: string) {
    const p = this.people.get(slug)!;
    let chat = this.chats.find((c) => c.providerId === p.providerId);
    if (!chat) this.chats.push((chat = { id: `chat${++this.n}`, providerId: p.providerId, name: `${p.first} ${p.last}`, messages: [] }));
    chat.messages.push({ id: `msg${++this.n}`, text, ts: new Date(Date.now() + this.n * 1000).toISOString(), mine: false });
    return chat;
  }
}
