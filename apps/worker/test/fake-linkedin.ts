/**
 * A tiny fake LinkedIn for browser tests. It mimics the accessible names and
 * page structure the real site uses for the controls Invytra touches.
 */
import { createServer, type Server } from "node:http";

type Kind = "open" | "more" | "connected" | "pending" | "email" | "limit";
const HIDDEN_CAPTCHA = '<iframe src="/captcha-widget" title="captcha" style="display:none"></iframe>';

interface Person {
  name: string;
  headline: string;
  kind: Kind;
}

export const PEOPLE: Record<string, Person> = {
  alice: { name: "Alice Smith", headline: "Founder at Acme", kind: "open" },
  bob: { name: "Bob Jones", headline: "CTO at Beta", kind: "more" },
  carol: { name: "Carol White", headline: "VP Sales at Gamma", kind: "connected" },
  dave: { name: "Dave Brown", headline: "Engineer", kind: "pending" },
  erin: { name: "Erin Green", headline: "Designer", kind: "email" },
  frank: { name: "Frank Black", headline: "Recruiter", kind: "limit" },
  olga: { name: "Olga Old", headline: "Old layout person", kind: "open" },
};

/** Profiles rendered with LinkedIn's pre-2026 layout (h1, buttons, first <section>). */
const OLD_LAYOUT = new Set(["olga"]);

export interface FakeState {
  invites: { slug: string; note: string | null }[];
  messages: { slug: string; text: string }[];
}

const page = (title: string, body: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
  <style>body{font-family:sans-serif;min-height:3000px} [hidden]{display:none!important}</style></head>
  <body>${body}</body></html>`;

function profileHtml(slug: string, p: Person, state: FakeState): string {
  const pending = p.kind === "pending" || state.invites.some((i) => i.slug === slug);
  const connected = p.kind === "connected";
  const old = OLD_LAYOUT.has(slug);
  const invite = `aria-label="Invite ${p.name} to connect"`;
  // 2026 layout uses links for Connect/Message and a text-only "More" button; old layout uses buttons.
  const link = (attrs: string, text: string) => (old ? `<button ${attrs}>${text}</button>` : `<a href="#" ${attrs}>${text}</a>`);
  const moreBtn = (id = "") => (old ? `<button ${id} aria-label="More actions">More</button>` : `<button ${id}>More</button>`);
  let actions = "";
  if (pending) {
    actions = `${link(`aria-label="Pending, click to withdraw invitation sent to ${p.name}"`, "Pending")}${moreBtn()}`;
  } else if (connected) {
    actions = `${link('id="msg"', "Message")}${moreBtn()}`;
  } else if (p.kind === "more") {
    actions = `<button aria-label="Follow ${p.name}">Follow</button>${moreBtn('id="more"')}
      <div id="menu" role="menu" hidden><div role="button" tabindex="0" id="connect" ${invite}>Connect</div>
      <div role="button" tabindex="0">Save to PDF</div></div>`;
  } else {
    actions = `${link(`id="connect" ${invite}`, "Connect")}${link('id="msg-nc"', "Message")}${moreBtn()}`;
  }
  const degree = connected ? "· 1st" : "· 2nd";
  const header = old
    ? `<section id="top"><h1>${p.name}</h1><div class="text-body-medium">${p.headline}</div><span>${degree}</span><div class="actions">${actions}</div></section>`
    : `<section aria-label="Primary content"><div componentkey="com.linkedin.sdui.profile.card.ref${slug}Topcard"><section>
         <a href="#" aria-label="Manage notifications about ${p.name}"></a>
         <a href="#"><h2>${p.name}</h2></a><p>${degree}</p><p>${p.headline}</p><p>Some City</p><p>·</p>
         <p>98</p><p>connections</p><div class="actions">${actions}</div></section></div>
       <div componentkey="aboutcard"><h2>About</h2><p>Lorem ipsum 1st place award</p></div>`;
  // A hidden sticky header duplicates the Connect link (invisible), like the real site.
  const sticky = old ? "" : `<div style="display:none"><a href="#" ${invite}>Connect</a><button aria-label="More">More</button></div>`;
  return page(
    `${p.name} | LinkedIn`,
    `<main>${header}${old ? "" : "</section>"}
      <section><h2>More profiles for you</h2><h3>Zed Zero</h3><button aria-label="Invite Zed Zero to connect">Connect</button></section>
    </main>${sticky}${HIDDEN_CAPTCHA}
    <aside><h2>People also viewed</h2><button aria-label="Invite Yan Yo to connect">Connect</button></aside>
    <div id="modal-root"></div>
    <div id="chat" hidden><ul id="thread"></ul>
      <div role="textbox" contenteditable="true" aria-label="Write a message…" id="box"></div>
      <button id="send-msg">Send</button><button aria-label="Close your conversation with ${p.name}">x</button></div>
    <script>
      const slug=${JSON.stringify(slug)}, kind=${JSON.stringify(p.kind)}, name=${JSON.stringify(p.name)}, old=${old};
      const more=document.getElementById('more'); if(more) more.onclick=()=>document.getElementById('menu').hidden=false;
      const c=document.getElementById('connect'); if(c) c.onclick=(e)=>{ e.preventDefault();
        const root=document.getElementById('modal-root');
        if(kind==='limit'){root.innerHTML='<div role="dialog"><p>You’ve reached the weekly invitation limit</p><button>Got it</button></div>';return;}
        if(kind==='email'){root.innerHTML='<div role="dialog"><p>To verify this member knows you, please enter their email to connect.</p><input type="email"></div>';
          document.addEventListener('keydown',e=>{if(e.key==='Escape')root.innerHTML='';});return;}
        root.innerHTML='<div role="dialog"><p>Add a note to your invitation?</p><button id="add">Add a note</button><button id="plain" aria-label="Send without a note">Send without a note</button></div>';
        const send=async(note)=>{await fetch('/api/invite/'+slug,{method:'POST',body:JSON.stringify({note})});
          root.innerHTML='';const lbl='aria-label="Pending, click to withdraw invitation sent to '+name+'"';
          document.querySelector('.actions').innerHTML= old ? '<button '+lbl+'>Pending</button>' : '<a href="#" '+lbl+'>Pending</a>';};
        document.getElementById('plain').onclick=()=>send(null);
        document.getElementById('add').onclick=()=>{root.querySelector('[role=dialog]').innerHTML=
          '<textarea name="message" maxlength="300"></textarea><button id="s" aria-label="Send invitation">Send</button>';
          document.getElementById('s').onclick=()=>send(root.querySelector('textarea').value);};
      };
      const m=document.getElementById('msg'); if(m) m.onclick=(e)=>{e.preventDefault();document.getElementById('chat').hidden=false;};
      const sm=document.getElementById('send-msg'); sm.onclick=async()=>{const box=document.getElementById('box');const t=box.innerText;
        await fetch('/api/message/'+slug,{method:'POST',body:JSON.stringify({text:t})});
        const li=document.createElement('li');li.textContent=t;document.getElementById('thread').appendChild(li);box.innerText='';};
    </script>`,
  );
}

const inboxHtml = page(
  "Messaging | LinkedIn",
  `${HIDDEN_CAPTCHA}<main><ul>
    <li class="msg-conversation-card__convo-item--unread"><a href="/messaging/thread/T1/"><h3>Carol White</h3><p>Sure, let's talk Tuesday</p><time>2h</time></a></li>
    <li><a href="/messaging/thread/T2/"><h3>Alice Smith</h3><p>You: Thanks for connecting!</p><time>Oct 12</time></a></li>
    <li><a href="/messaging/thread/T3/"><h3>Bob Jones</h3><p>Not interested, thanks</p><time>Oct 10</time></a></li>
    <li><a href="/messaging/thread/T1/?x=dup"><h3>Carol White</h3><p>dup link</p></a></li>
  </ul></main>`,
);

export function startFakeLinkedIn(): { server: Server; state: FakeState } {
  const state: FakeState = { invites: [], messages: [] };
  const server = createServer((req, res) => {
    const cookie = req.headers.cookie ?? "";
    const loggedIn = /li_at=valid/.test(cookie);
    const path = (req.url ?? "/").split("?")[0]!;
    const send = (status: number, body: string, headers: Record<string, string> = {}) => {
      res.writeHead(status, { "content-type": "text/html; charset=utf-8", ...headers });
      res.end(body);
    };
    if (req.method === "POST" && path.startsWith("/api/")) {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const [, , kind, slug] = path.split("/");
        const data = JSON.parse(body || "{}");
        if (kind === "invite") state.invites.push({ slug: slug!, note: data.note ?? null });
        if (kind === "message") state.messages.push({ slug: slug!, text: data.text });
        send(200, "{}", { "content-type": "application/json" });
      });
      return;
    }
    if (!loggedIn) return send(302, "", { location: "/login" });
    if (path.startsWith("/feed")) return send(200, page("Feed | LinkedIn", `${HIDDEN_CAPTCHA}<main><h1>Start a post</h1></main>`));
    if (path.startsWith("/messaging")) return send(200, inboxHtml);
    const m = /^\/in\/([^/]+)/.exec(path);
    if (m) {
      const person = PEOPLE[m[1]!];
      if (!person) return send(404, page("Page not found | LinkedIn", "<main><div><p>This page doesn’t exist</p></div></main>"));
      return send(200, profileHtml(m[1]!, person, state));
    }
    if (path.startsWith("/login")) return send(200, page("LinkedIn Login", "Sign in"));
    send(404, page("Not found", "nope"));
  });
  return { server, state };
}
