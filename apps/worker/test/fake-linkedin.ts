/**
 * A tiny fake LinkedIn for browser tests. It mimics the accessible names and
 * page structure the real site uses for the controls Invytra touches.
 */
import { createServer, type Server } from "node:http";

type Kind = "open" | "more" | "connected" | "pending" | "email" | "limit" | "instant" | "native" | "notelimit";
const HIDDEN_CAPTCHA = '<iframe src="/captcha-widget" title="captcha" style="display:none"></iframe>';

interface Person {
  name: string;
  headline: string;
  kind: Kind;
  /** Connection degree when not connected (default "2nd"). */
  degree?: "2nd" | "3rd+";
  /** Shows a Premium badge. */
  premium?: boolean;
}

export const PEOPLE: Record<string, Person> = {
  alice: { name: "Alice Smith", headline: "Founder at Acme", kind: "open" },
  bob: { name: "Bob Jones", headline: "CTO at Beta", kind: "more" },
  carol: { name: "Carol White", headline: "VP Sales at Gamma", kind: "connected" },
  dave: { name: "Dave Brown", headline: "Engineer", kind: "pending" },
  erin: { name: "Erin Green", headline: "Designer", kind: "email" },
  frank: { name: "Frank Black", headline: "Recruiter", kind: "limit" },
  olga: { name: "Olga Old", headline: "Old layout person", kind: "open", degree: "3rd+" },
  ivan: { name: "Ivan Instant", headline: "Sends with no dialog", kind: "instant" },
  nina: { name: "Nina Native", headline: "Native dialog element", kind: "native" },
  pam: { name: "Pam Premium", headline: "Out of free notes", kind: "notelimit", premium: true },
  quinn: { name: "Quinn Quota", headline: "Out of free notes too", kind: "notelimit" },
  tess: { name: "Tess Tester", headline: "The logged-in member", kind: "open" },
};

/** Login form: any email works; the password "right-password" signs in. */
const loginHtml = (error = "") =>
  page(
    "LinkedIn Login",
    `<main><h1>Sign in</h1>${error ? `<p role="alert">${error}</p>` : ""}
    <form method="post" action="/login">
      <label>Email <input id="username" name="session_key" autofocus></label>
      <label>Password <input id="password" name="session_password" type="password"></label>
      <button type="submit">Sign in</button>
    </form></main>`,
  );

/** Profiles rendered with LinkedIn's pre-2026 layout (h1, buttons, first <section>). */
const OLD_LAYOUT = new Set(["olga"]);

export interface FakeState {
  invites: { slug: string; note: string | null }[];
  messages: { slug: string; text: string }[];
  /** Emails that signed in through the login form. */
  logins: string[];
  /** People who accepted an invite (test hook: POST /__test/accept/<slug>). */
  accepted: string[];
  /** Extra inbox replies (test hook: POST /__test/reply/<slug> with the text). */
  replies: { slug: string; text: string }[];
  /** Posts liked, as "<slug>#<post>". */
  likes: string[];
  /** People whose pending invite was withdrawn. */
  withdrawn: string[];
  /** Replies sent from the Messaging page. */
  inboxReplies: { name: string; text: string }[];
}

/** Sales Navigator member ids → profile names (LinkedIn redirects /in/<id>/ to the profile). */
export const SALES_IDS: Record<string, string> = {
  ACwAAAalice0001XyZ: "alice",
  ACwAAAbob00002XyZ: "bob",
  ACwAAAolga0003XyZ: "olga",
};

/** Whose posts the activity page shows; carol's latest is already liked. */
const POSTS: Record<string, string[]> = { alice: ["p1", "p2"], carol: ["c1"], dave: ["d1"] };

const page = (title: string, body: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
  <style>body{font-family:sans-serif;min-height:3000px} [hidden]{display:none!important}</style></head>
  <body>${body}</body></html>`;

function profileHtml(slug: string, p: Person, state: FakeState): string {
  const pending =
    !state.accepted.includes(slug) && !state.withdrawn.includes(slug) && (p.kind === "pending" || state.invites.some((i) => i.slug === slug));
  const connected = p.kind === "connected" || state.accepted.includes(slug);
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
      <div id="menu" role="menu" hidden><div role="menuitem" tabindex="0">Send profile in a message</div>
      <div role="menuitem" tabindex="0" id="connect" ${invite}>Connect</div>
      <div role="menuitem" tabindex="0">Save to PDF</div></div>`;
  } else {
    actions = `${link(`id="connect" ${invite}`, "Connect")}${link('id="msg-nc"', "Message")}${moreBtn()}`;
  }
  const degree = connected ? "· 1st" : `· ${p.degree ?? "2nd"}`;
  const badge = p.premium ? '<span data-test-icon="linkedin-bug-premium-xsmall" aria-hidden="true"></span>' : "";
  const header = old
    ? `<section id="top"><h1>${p.name}</h1>${badge}<div class="text-body-medium">${p.headline}</div><span>${degree}</span><div class="actions">${actions}</div></section>`
    : `<section aria-label="Primary content"><div componentkey="com.linkedin.sdui.profile.card.ref${slug}Topcard"><section>
         <a href="#" aria-label="Manage notifications about ${p.name}"></a>
         <a href="#"><h2>${p.name}</h2></a>${badge}<p>${degree}</p><p>${p.headline}</p><p>Some City</p><p>·</p>
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
    <div class="video-player"><div role="dialog" aria-label="Modal Window"><p>This is a modal window.</p></div></div>
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
        const send=async(note)=>{await fetch('/api/invite/'+slug,{method:'POST',body:JSON.stringify({note})});
          root.innerHTML='';const lbl='aria-label="Pending, click to withdraw invitation sent to '+name+'"';
          document.querySelector('.actions').innerHTML= old ? '<button '+lbl+'>Pending</button>' : '<a href="#" '+lbl+'>Pending</a>';};
        if(kind==='instant'){send(null);return;}
        const wrap = kind==='native' ? ['<dialog open>','</dialog>'] : ['<div role="dialog">','</div>'];
        const addCtl = kind==='native' ? '<a href="#" id="add">Add a note</a>' : '<button id="add">Add a note</button>';
        root.innerHTML=wrap[0]+'<p>Add a note to your invitation?</p>'+addCtl+'<button id="plain">Send without a note</button>'+wrap[1];
        document.getElementById('plain').onclick=()=>send(null);
        if(kind==='notelimit'){document.getElementById('add').onclick=(e)=>{e.preventDefault();
          root.innerHTML='<dialog open><button aria-label="Dismiss" id="dis"></button><p>Send unlimited personalized invites with Premium</p><p>You&#39;re out of free custom notes. Bypass the limit with Premium.</p><a href="#">Reactivate Premium</a></dialog>';
          document.getElementById('dis').onclick=()=>{root.innerHTML='';};};return;}
        document.getElementById('add').onclick=(e)=>{e.preventDefault();root.querySelector('[role=dialog], dialog').innerHTML=
          '<textarea name="message" maxlength="300"></textarea><button id="s" aria-label="Send invitation">Send</button>';
          document.getElementById('s').onclick=()=>send(root.querySelector('textarea').value);};
      };
      const pend=document.querySelector('[aria-label^="Pending, click to withdraw"]'); if(pend) pend.onclick=(e)=>{e.preventDefault();
        document.getElementById('modal-root').innerHTML='<div role="dialog"><h2>Withdraw invitation</h2><p>If you withdraw now, you won’t be able to resend to '+name+' for up to 3 weeks.</p><button id="cancel-w">Cancel</button><button id="do-w">Withdraw</button></div>';
        document.getElementById('cancel-w').onclick=()=>{document.getElementById('modal-root').innerHTML='';};
        document.getElementById('do-w').onclick=async()=>{await fetch('/api/withdraw/'+slug,{method:'POST'});document.getElementById('modal-root').innerHTML='';
          document.querySelector('.actions').innerHTML= old ? '<button id="connect">Connect</button>' : '<a href="#" id="connect">Connect</a>';};};
      const m=document.getElementById('msg'); if(m) m.onclick=(e)=>{e.preventDefault();document.getElementById('chat').hidden=false;};
      const sm=document.getElementById('send-msg'); sm.onclick=async()=>{const box=document.getElementById('box');const t=box.innerText;
        await fetch('/api/message/'+slug,{method:'POST',body:JSON.stringify({text:t})});
        const li=document.createElement('li');li.textContent=t;document.getElementById('thread').appendChild(li);box.innerText='';};
    </script>`,
  );
}

function activityHtml(slug: string, p: Person, state: FakeState): string {
  const posts = POSTS[slug] ?? [];
  const body = posts.length
    ? posts
        .map((id, i) => {
          const liked = state.likes.includes(`${slug}#${id}`) || (slug === "carol" && i === 0);
          return `<div data-urn="urn:li:activity:${slug}${id}" class="post"><p>${p.name} posted: thoughts number ${i + 1}</p>
            <button aria-label="React Like" aria-pressed="${liked}" data-post="${id}">Like</button><button>Comment</button><button>Repost</button></div>`;
        })
        .join("")
    : `<p>${p.name.split(" ")[0]} hasn’t posted yet</p>`;
  return page(
    `Activity | ${p.name} | LinkedIn`,
    `${HIDDEN_CAPTCHA}<main><h1>All activity</h1>${body}</main>
    <script>document.querySelectorAll('[data-post]').forEach(b=>b.onclick=async()=>{
      await fetch('/api/like/${slug}',{method:'POST',body:JSON.stringify({post:b.dataset.post})});b.setAttribute('aria-pressed','true');});</script>`,
  );
}

/** LinkedIn people search: page 1 has 5 results (one hidden "LinkedIn Member"), page 2 has 2; keywords=limit shows the monthly limit. */
function searchHtml(params: URLSearchParams): string {
  if (params.get("keywords") === "limit") {
    return page("Search | LinkedIn", `${HIDDEN_CAPTCHA}<main><h2>You’ve reached the monthly limit for profile searches</h2><p>Upgrade to Premium</p></main>`);
  }
  const n = Number(params.get("page") ?? "1");
  const slugs = n === 1 ? ["alice", "bob", "olga", "ivan"] : n === 2 ? ["nina", "pam"] : [];
  if (!slugs.length) return page("Search | LinkedIn", `${HIDDEN_CAPTCHA}<main><h2>No results found</h2></main>`);
  const item = (slug: string) => {
    const p = PEOPLE[slug]!;
    return `<li><div><a href="/in/${slug}?miniProfileUrn=urn%3Ali%3Afs_miniProfile%3AACoAAX"><img alt=""></a>
      <a href="/in/${slug}?miniProfileUrn=x"><span aria-hidden="true">${p.name}${slug === "olga" ? ", MBA" : ""}</span><span class="visually-hidden">View ${p.name}’s profile</span></a>
      ${p.premium ? '<span data-test-icon="linkedin-bug-premium-xsmall"></span>' : ""}<span>• ${p.degree ?? "2nd"}</span><div>${p.headline}</div><div>Pune, Maharashtra, India</div><button aria-label="Invite ${p.name} to connect">Connect</button></div></li>`;
  };
  const member = `<li><div><span>LinkedIn Member</span><div>Head of Growth at Hidden Co</div></div></li>`;
  return page(
    "Search | LinkedIn",
    `${HIDDEN_CAPTCHA}<main><ul role="list">${slugs.map(item).join("")}${n === 1 ? member : ""}</ul>
    <div><button aria-label="Previous" ${n === 1 ? "disabled" : ""}>Previous</button><button aria-label="Next" ${n === 2 ? "disabled" : ""}>Next</button></div></main>
    <aside><h2>People also viewed</h2></aside>`,
  );
}

/** Sales Navigator: 2 leads on page 1, 1 on page 2. Results only appear after scrolling, like the real thing. */
function salesHtml(params: URLSearchParams): string {
  const n = Number(params.get("page") ?? "1");
  const ids = n === 1 ? ["ACwAAAalice0001XyZ", "ACwAAAbob00002XyZ"] : n === 2 ? ["ACwAAAolga0003XyZ"] : [];
  const rows = ids
    .map((id) => {
      const p = PEOPLE[SALES_IDS[id]!]!;
      return `<li><a href="/sales/lead/${id},NAME_SEARCH,abcd?_ntb=x"><span data-anonymize="person-name">${p.name}</span></a>
        <span data-anonymize="title">${p.headline.split(" at ")[0]}</span><a data-anonymize="company-name" href="/sales/company/1">${p.headline.split(" at ")[1] ?? "Self-employed"}</a>
        <span data-anonymize="location">Mumbai, India</span></li>`;
    })
    .join("");
  return page(
    "Sales Navigator",
    `${HIDDEN_CAPTCHA}<main><div id="search-results-container" style="height:400px;overflow:auto"><div style="height:900px"></div><ol id="res"></ol></div>
    <button aria-label="Next" ${n >= 2 ? "disabled" : ""}>Next</button></main>
    <script>const box=document.getElementById('search-results-container');box.addEventListener('scroll',()=>{
      if(!document.getElementById('res').innerHTML) document.getElementById('res').innerHTML=${JSON.stringify(rows)};});</script>`,
  );
}

/** Full conversations, oldest first, as the Messaging page shows them when one is opened. */
function threadsFor(state: FakeState): Record<string, { me: boolean; date: string; time: string; text: string }[]> {
  const t: Record<string, { me: boolean; date: string; time: string; text: string }[]> = {
    "Carol White": [
      { me: true, date: "OCT 18", time: "12:14 PM", text: "Hi Carol, I am reaching out to connect with other leaders in sales." },
      { me: false, date: "OCT 18", time: "12:15 PM", text: "I'm happy to connect" },
      { me: false, date: "TODAY", time: "11:02 AM", text: "Sure, let's talk Tuesday" },
    ],
    "Alice Smith": [{ me: true, date: "OCT 12", time: "9:00 AM", text: "Thanks for connecting!" }],
    "Bob Jones": [{ me: false, date: "OCT 10", time: "4:40 PM", text: "Not interested, thanks" }],
  };
  for (const r of state.replies) {
    const name = PEOPLE[r.slug]?.name ?? r.slug;
    (t[name] ??= []).push({ me: false, date: "TODAY", time: "1:30 PM", text: r.text });
  }
  for (const r of state.inboxReplies) (t[r.name] ??= []).push({ me: true, date: "TODAY", time: "2:00 PM", text: r.text });
  return t;
}

const inboxHtml = (state: FakeState) =>
  page(
    "Messaging | LinkedIn",
    `${HIDDEN_CAPTCHA}<main><h1>Messaging</h1><h2>Conversation List</h2><ul aria-label="Conversation List">
    <li></li>
    ${state.replies
      .map((r) => `<li><h3>${PEOPLE[r.slug]?.name ?? r.slug}</h3><time>now</time><p>${r.text}</p><span>1 new notification</span></li>`)
      .reverse()
      .join("")}
    <li><h3>Ashlyn Gonzales, MS</h3><time>9:07 PM</time><p>Sponsored Free Gift After Tour</p></li>
    <li><h3>Carol White</h3><time>2h</time><p>Carol: Sure, let's talk Tuesday</p><span>1 new notification . Press return to go to conversation details</span></li>
    <li><h3>Alice Smith</h3><time>Oct 12</time><p>You: Thanks for connecting!</p></li>
    <li><h3>Bob Jones</h3><time>Oct 10</time><p>Bob: Not interested, thanks</p></li>
    <li><h3>Carol White</h3><time>Oct 1</time><p>older duplicate</p></li>
  </ul></main>
  <section id="conv" hidden><h2 id="conv-name"></h2><ul class="msg-s-message-list-content" id="conv-thread"></ul>
    <div role="textbox" contenteditable="true" aria-label="Write a message…" id="conv-box"></div><button id="conv-send">Send</button></section>
  <script>
    const THREADS=${JSON.stringify(threadsFor(state))};
    let open='';
    const esc=(t)=>t.replace(/[&<>]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
    const render=()=>{let html='',date='';for(const m of THREADS[open]||[]){
      let head='';if(m.date!==date){date=m.date;head='<h3 class="msg-s-message-list__time-heading">'+m.date+'</h3>';}
      html+='<li class="msg-s-message-list__event">'+head+'<div class="msg-s-message-group__meta"><span class="msg-s-message-group__name">'+(m.me?'Tess Tester':open)+'</span><time class="msg-s-message-group__timestamp">'+m.time+'</time></div>'
        +'<div class="msg-s-event-listitem'+(m.me?'':' msg-s-event-listitem--other')+'"><p class="msg-s-event-listitem__body">'+esc(m.text)+'</p></div></li>';}
      document.getElementById('conv-thread').innerHTML=html;};
    document.querySelectorAll('[aria-label="Conversation List"] h3').forEach(h=>h.onclick=()=>{
      open=h.textContent;document.getElementById('conv').hidden=false;document.getElementById('conv-name').textContent=open;render();});
    document.getElementById('conv-send').onclick=async()=>{const box=document.getElementById('conv-box');const t=box.innerText;
      await fetch('/api/reply',{method:'POST',body:JSON.stringify({name:open,text:t})});
      (THREADS[open]=THREADS[open]||[]).push({me:true,date:'TODAY',time:'2:00 PM',text:t});render();box.innerText='';};
  </script>`,
  );

export function startFakeLinkedIn(): { server: Server; state: FakeState } {
  const state: FakeState = { invites: [], messages: [], logins: [], accepted: [], replies: [], likes: [], withdrawn: [], inboxReplies: [] };
  const server = createServer((req, res) => {
    const cookie = req.headers.cookie ?? "";
    const loggedIn = /li_at=valid/.test(cookie);
    const path = (req.url ?? "/").split("?")[0]!;
    const send = (status: number, body: string, headers: Record<string, string> = {}) => {
      res.writeHead(status, { "content-type": "text/html; charset=utf-8", ...headers });
      res.end(body);
    };
    // Test hooks (no login needed): someone accepts an invite, or writes back.
    if (req.method === "POST" && path.startsWith("/__test/")) {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const [, , kind, slug] = path.split("/");
        if (kind === "accept") state.accepted.push(slug!);
        if (kind === "reply") state.replies.push({ slug: slug!, text: body || "Sounds good!" });
        send(200, "{}", { "content-type": "application/json" });
      });
      return;
    }
    if (req.method === "POST" && path.startsWith("/api/")) {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const [, , kind, slug] = path.split("/");
        const data = JSON.parse(body || "{}");
        if (kind === "invite") state.invites.push({ slug: slug!, note: data.note ?? null });
        if (kind === "message") state.messages.push({ slug: slug!, text: data.text });
        if (kind === "like") state.likes.push(`${slug}#${data.post}`);
        if (kind === "withdraw") state.withdrawn.push(slug!);
        if (kind === "reply") state.inboxReplies.push({ name: data.name, text: data.text });
        send(200, "{}", { "content-type": "application/json" });
      });
      return;
    }
    if (req.method === "POST" && path === "/login") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const form = new URLSearchParams(body);
        if (form.get("session_password") !== "right-password") return send(200, loginHtml("Wrong email or password."));
        state.logins.push(form.get("session_key") ?? "");
        send(302, "", { location: "/feed/?trk=login", "set-cookie": "li_at=valid; Path=/; HttpOnly" });
      });
      return;
    }
    if (path.startsWith("/login")) return send(200, loginHtml());
    if (!loggedIn) return send(302, "", { location: "/login" });
    if (path === "/in/me" || path === "/in/me/") return send(302, "", { location: "/in/tess/" });
    if (path.startsWith("/feed")) return send(200, page("Feed | LinkedIn", `${HIDDEN_CAPTCHA}<main><h1>Start a post</h1></main>`));
    if (path.startsWith("/messaging")) return send(200, inboxHtml(state));
    const query = new URLSearchParams((req.url ?? "").split("?")[1] ?? "");
    if (path.startsWith("/search/results/people")) return send(200, searchHtml(query));
    if (path.startsWith("/sales/search/people") || path.startsWith("/sales/lists/people")) {
      if ((query.get("query") ?? "").includes("nosales")) return send(302, "", { location: "/premium/products/?upsellOrderOrigin=sales" });
      return send(200, salesHtml(query));
    }
    if (path.startsWith("/premium/")) return send(200, page("Premium", "<main><h1>Start your free trial of Sales Navigator</h1></main>"));
    const act = /^\/in\/([^/]+)\/recent-activity\//.exec(path);
    if (act) {
      const person = PEOPLE[act[1]!];
      if (!person) return send(404, page("Page not found | LinkedIn", "<main><p>This page doesn’t exist</p></main>"));
      return send(200, activityHtml(act[1]!, person, state));
    }
    const m = /^\/in\/([^/]+)/.exec(path);
    if (m && SALES_IDS[m[1]!]) return send(302, "", { location: `/in/${SALES_IDS[m[1]!]}/` });
    if (m) {
      const person = PEOPLE[m[1]!];
      if (!person) return send(404, page("Page not found | LinkedIn", "<main><div><p>This page doesn’t exist</p></div></main>"));
      return send(200, profileHtml(m[1]!, person, state));
    }
    send(404, page("Not found", "nope"));
  });
  return { server, state };
}
