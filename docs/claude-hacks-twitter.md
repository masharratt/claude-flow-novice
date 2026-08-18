Every Agentic Engineering Hack I Know (June 2026)
Matt Van Horn
@mvanhorn
·
Jun 2

Three months ago I posted "Every Claude Code Hack I Know." It hit 913K views. @kevinrose had asked what IDE to use, and my answer was: "No IDE. Just plan.md files and voice."
This used to be called vibe coding. Around last Thanksgiving the models got good enough that the toy became real, what people now call Agentic Engineering. It's the only reason I ship. This year I put out last30days (27K stars), Printing Press(4K+ stars), and Agent Cookie, just launched, and became a top contributor to some of the biggest projects in open source: Python, Go, GStack, and Paperclip. I hadn't shipped software anyone valued since high school. These are my hacks.
HACKS
The YOLO TL;DR Hack: paste this entire article to your agent and tell it to make a plan to set up everything in it, then work that plan one hack at a time. That's my whole stack, no reading required.
1. The Moment You Have an Idea, Make a CE plan.md
Still rule number one. Still the most important thing I've learned.
The moment I have an idea, it's /ce-plan to make a plan.md. Not "let me think about this," not "let me start coding." /ce-plan, every time. It takes images too, so anything you can capture is a starting point:
Crazy product idea: /ce-plan.
Bug on GitHub: copy the issue URL, paste it, /ce-plan.
Terminal error: Cmd+Shift+4 to screenshot, Ctrl+V to paste, /ce-plan fix this.
Screenshots, error messages, design mockups, Slack threads: drop any of them in.
When the idea is still fuzzy and I don't even know what I want yet, I start with /ce-brainstorm to think it through with the agent, then /ce-plan once it's sharp.
Under the hood, /ce-plan fans out research agents in parallel. One reads your codebase, finds patterns, checks your conventions. One searches your past solutions for learnings. If the topic warrants it, more go research external docs and best practices. All at once. Then it consolidates and writes a structured plan.md: what's wrong, the approach, which files to touch, acceptance criteria with checkboxes, patterns to follow from your own code. Grounded in your repo, your conventions, your history. Not generic advice.
/ce-work takes that plan and builds it. Context blows up? Start a new session, point it at the plan, pick up where you left off. The plan is the checkpoint that survives everything.
Traditional dev is 80% coding, 20% planning. This flips it. The thinking goes in the plan. The execution is mechanical.
Compound Engineering, from @kieranklaassen and @trevin is the plugin that makes it real.
I became a superfan, then a contributor, now I’m the 3rd biggest contributor behind the core team. My rule now: unless it is literally a one-line change, there is always a plan.md first.
HACKS
Install Compound Engineering: /plugin marketplace add EveryInc/compound-engineering-plugin
Paste a screenshot, bug URL, or error, then /ce-plan, then /ce-work.
Fuzzy idea? /ce-brainstorm first.
2. Don't Read the plan.md
I always make the plan.md. I almost never read it. Plans are for agents, you silly human.
Forcing a plan to exist makes the agents not lazy. It makes them research, commit to an approach, write down acceptance criteria, and then actually hit them. A coding agent with a plan ships finished work. A coding agent without one cuts corners and stops early. The plan is the leash.
So I let it write the plan, I skim the title, and I run /ce-work. If I have a question I ask it inline, right there in the session: "wait, why this approach?" Or I ask for a TLDR. Or, when when I don’t understand, "eli5 this plan." I get the one-paragraph version, nod, keep going. I do not sit there reading 300 lines of markdown. That's the agent's homework, not mine.
Make the plan. Trust the plan. Don't read the plan.
HACKS
Don't let yourself read the plan. Ask inline: TLDR?, eli5 this plan, or "wait, why this approach?"
3. Use /ce-plan for Your Deepest Non-Engineering Work, Make a Plan for the Plan
People think /ce-plan and /ce-work are for code. The biggest thing I've learned since March is that they aren't. The deepest knowledge work I do now runs through the same loop, and the trick is to make the first plan a plan for the plan. This isn't me forcing a code tool to do something it wasn't built for, either: /ce-plan has a universal planning mode built in, made for exactly this kind of non-code work.
It's not just business problems either. Strategy docs, product specs, competitive analysis, board updates, all the same loop.
Here's a real one. I met with Michael Margolis, the former GV research partner known for the bullseye-customer method, about a business challenge I was brewing on. He told me to read his book, free as a PDF on his site. The old move would be to skim it and move on. Instead I opened Claude Code and said, roughly:
"/ce-plan make a plan for the plan. I'm about to hand you two things: Margolis's book as a PDF, and the two-hour Granola transcript of the meeting I just had with him, which has the full context of what we discussed. I want a thoughtful plan for how my business problem, that conversation, and the lessons in the book come together into something I can actually use. Do not write that document now. Writing it is the work. Right now I only want the plan for how you'll read the book, mine the transcript, and produce a great document."
It spent the next 45 minutes creating an EPIC plan.
It's also the single best trick I know for making an LLM not lazy. Ask for the deliverable directly and it cuts corners. Ask it to first plan how it will produce the deliverable, then execute that plan, and it does the deep version every time.
HACKS
Deep non-code work: /ce-plan make a plan for the plan, hand it your all your context and transcript, then /ce-work.
4. Get Voice-Pilled
Voice-to-LLM is different from voice-to-anything-else. The transcription doesn't have to be perfect because the listener understands context. It guesses what the mic got wrong. You can mumble, trail off, restart a sentence. Voice finally works because the thing on the other end is smart enough to fill the gaps.
My setup:
Mac: Monologue (from Every) or Wispr Flow. Pick one, pipe speech into whatever app is focused, talk into Claude Code. I bought a gooseneck mic for the office.
Phone: skip Monologue and Wispr Flow, switching to them on iOS is too annoying. Apple's built-in dictation is good enough, because you're talking to an LLM, not a human. It can mangle half the words and the agent still gets it. Lazy notes are fine.
One honest admission: I'm great with voice when I'm alone. In the office I struggle with it. People say you can just whisper into the mic, but I find I don't actually do it, because I don't want to be rude or distract the people around me. So a desk in a shared room is still my weak spot for this whole workflow. If you've cracked voice in an open office without being that person, tell me how. I genuinely want the advice.
HACKS
Mac: install Monologue or Wispr Flow. Phone: use Apple dictation. Get a gooseneck mic.
5. Lots and Lots of Tabs in cmux
This is how I actually spend a day. Four to six cmux tabs, sometimes more, each a separate session:
One writing a plan.
One building from a different plan.
One running last30days.
One fixing a bug I found testing the last thing.
While /ce-plan spins up research in one window, I switch to another and /ce-work a plan that's already written. While that builds, a third window gets a new bug pasted in. By the time I cycle back, the first one is done and waiting.
I hear great things about Orca for the mobile work they are doing. I also used to be a Ghostty purist, but I was losing too many notifications in ghostty.
HACKS
Use cmux.
Keep 4 to 6 tabs open, a different task in each.
6. Make Your Terminal Default Into Claude or Codex, Not a Shell
A new tab should open straight into Claude Code, not a shell. Open a tab, you're already talking to an agent. No cd, no typing claude. When a new session costs one keystroke, you start a lot more of them. I also don't use folders. Your agent can find your project.
HACKS
Paste to your agent: "Make every new terminal tab open directly into Claude Code. In ~/.config/ghostty/config, add the line command = ~/.local/bin/claude-launcher.sh without disturbing any other settings already in that file. Then create ~/.local/bin/claude-launcher.sh that runs claude --dangerously-skip-permissions, and when Claude exits prints a short note and drops me into an interactive login zsh. chmod +x the script. This works for both Ghostty and cmux, since cmux reads the same Ghostty config."
7. Remote Control Every Window, and Give Claude Code or Codex an Email Address
Two hacks that make every session reachable from anywhere.
Turn on remote control every time you open a new window
Set remote control to turn on automatically for every session.
Now every window is reachable from the Claude mobile app. Start a session at your desk, walk away, pick up the exact same live run on your phone mid-task. In a line somewhere, you're steering what's churning away on your Mac at home.
Give your Claude an email address
Claude Code can have an email address with AgentMail. The founder, Adi @adisingh taught me this. Email the inbox and a fresh session opens and starts working on whatever's in the subject and body, with any attachments available by path. Bug at dinner? Email it from your phone and a session is running before you're back at a screen. I open-sourced the whole thing: github.com/mvanhorn/agentmail-to-claude-code.
Three pieces:
A daemon that watches an AgentMail inbox over WebSocket. On every allowlisted email it opens a fresh Claude session, writes the email to a prompt file, and tells Claude to read and act on it.
Two terminal backends, cmux or standalone Ghostty, so it drives whatever you already launch into.
A sender. I wired it to a cc command in my Hermes, so from my phone I run cc <task> and it lands as a working session on my Mac, no VPN, no SSH.
The allowlist is the gate. Only addresses you control get through, and anything that fails DKIM or SPF is dropped before a session ever opens.
HACKS
Always-on remote control: add "remoteControlAtStartup": true to ~/.claude/settings.json.
Give Claude an email. Paste to your agent: "Give Claude Code an email address using github.com/mvanhorn/agentmail-to-claude-code. Clone it, set up an AgentMail inbox, fill cc.env with my API key, the inbox, an allowlist of only my own addresses, and my terminal (cmux or Ghostty), then run the daemon and install it as a launchd job. When I email that inbox, a fresh Claude Code session should open on this Mac and start on the subject and body."
8. Dangerously Skip Permissions, and Yes I Mean It
Claude Code asks permission for every edit and command. With six sessions you can't babysit it. Two settings make it livable. People say auto is the “safer” way to do this, but it slows me down too much.
skipDangerousModePermissionPrompt: true is the key. Without it, Claude asks you to confirm every session. You can also Shift+Tab to toggle. People tell me the newer "auto" mode gets you most of the way there with more safety. Maybe. I say YOLO. It's my computer. GitHub is there if I break or ruin everything. When I set up a friend's Claude Code, the AI actively tried to talk him out of enabling this. You have to be direct with it.
The other setting is a sound hook, non-negotiable with six sessions.
Walk away, come back when you hear it. With six sessions running, the sound is how you know which one just finished.
HACKS
Paste into ~/.claude/settings.json:
{ "permissions": { "allow": [ "WebSearch", "WebFetch", "Bash", "Read", "Write", "Edit", "Glob", "Grep", "Task", "TodoWrite" ], "deny": [], "defaultMode": "bypassPermissions" }, "skipDangerousModePermissionPrompt": true }
{ "hooks": { "Stop": [ { "hooks": [ { "type": "command", "command": "afplay /System/Library/Sounds/Blow.aiff" } ] } ] } }
Codex has the same YOLO mode. In ~/.codex/config.toml:
approval_policy = "never"
sandbox_mode = "danger-full-access"
Or launch a one-off with codex --yolo.
9. How I Run Most of My Code Through Codex Without Ever Opening the Codex CLI
I send work to Codex all day, and I almost never open the Codex CLI to do it. Claude plans, Codex builds, and I never leave my Claude session.
Three ways I hand work to Codex without leaving Claude:
Codex IDE extension: send a task, apply the result, never drop into the Codex terminal.
/ce-work --codex: delegates the build straight to Codex from inside the Compound Engineering loop.
Printing Press Codex mode: put codex at the end of the prompt when printing a new CLI and it hands the build to Codex.
My settings, both engines cranked to extra-high reasoning:
Codex: reasoning xhigh, fast mode on, always.
Claude Code: reasoning xhigh, fast mode off. Its fast mode bills per token on top of your $200 Max plan, so I skip it.
Two $200 plans side by side is a whole second engine. I push big parallel builds to Codex and keep Claude on planning and taste. Some friends run it the other way, Codex builds and Claude reviews.
HACKS
Codex: reasoning xhigh, fast mode on. Claude Code: xhigh, fast mode off.
Hand work to Codex: the Codex IDE extension, /ce-work --codex, or codex at the end of a Printing Press prompt.
10. Research Before You Plan: last30days
Before I /ce-plan, I usually run /last30days on it first.
I was choosing between Vercel's agent-browser and Playwright. Instead of reading docs, I ran /last30days Vercel agent browser vs Playwright. In a few minutes: dozens of Reddit threads, X posts, YouTube videos, HN stories. Agent-browser uses far less context per call, Playwright dumps thousands of tokens just for tool definitions. I fed the whole output into /ce-plan integrate agent-browser. The plan came out grounded in what the community actually knows right now, not six-month-old training data.
last30days is open source, now past 26K stars. It searches Reddit, X, YouTube, TikTok, Instagram, HN, Polymarket, GitHub, and the web in parallel. I run it before I pick a library, before I build a feature, before I meet with a business partner, before I write an article. I ran it on a few of the things in this post. Research, plan, build. That's the real loop.
HACKS
Install last30days. Before /ce-plan, run /last30days <topic>.
Make sure you install a ScrapeCreators key
11. Granola All the Things, and Put the RAW Transcript In your LLM
I had lunch with a candidate. We talked product, and food, and kids, ninety minutes of normal conversation with a product idea woven through it. Granola was running. After, I pasted the full raw transcript into Claude Code: /ce-plan turn this into a product proposal.
The trick is raw. I don't summarize first. I drop the whole messy transcript in, tangents about sushi and all, and let Claude do the extraction against my actual codebase and every prior strategy plan I've written. Granola context plus codebase plus prior plans equals gold. It one-shotted a proposal, ignored the restaurant talk, and I sent it that night. The guy works with us full time now.
And the upgrade since March: the Printing Press Granola CLI. It is magic. I pull any meeting as clean structured data straight into a session, search across every meeting I've ever had, find the one thing someone said three weeks ago, and pipe it into a plan. No more copy-paste. Every meeting's context is one command away.
HACKS
Drop the raw Granola transcript into /ce-plan, don't summarize first. Install the Printing Press Granola CLI.
12. Human Signal
Here's the mindset shift that took me longest. When you run six agents, your job is not to do the work. Your job is to be the signal.
The agents supply volume. You supply taste, direction, and the react-and-redirect loop. You look at what came back, you say "option two is closer but use the language from option one," "address the biggest risk," "this paragraph is too long," and they move. The rare, valuable thing in the loop is your judgment, not your typing. The more I leaned into being the human signal and stopped trying to also be a hand doing the work, the more I shipped.
Be the taste. Let them be the hands.
HACKS
Add value to the world by directing your agents with your brain. It still has value.
13. HyperFrames for Video, for All the Things
Video used to be the thing I outsourced or skipped. Now I make it the same way I make everything else: I talk, an agent builds, I react.
HyperFrames lets me build video as HTML, so an agent can write it. The loop is identical to code, the output is just an MP4 instead of a PR. Each one is a folder with a script.md, scene by scene, kinetic typography, captions carrying every beat. The agent turns that script into the composition and renders it. No editor, no timeline.
Launch reels I made this way:
Granola CLI demo
Agent Cookie launch

Agent Cookie Launch Video Made in HyperFrame
The cost of a video dropped to a conversation, so anything that deserves one now gets one: launch reels, product demos, animated explainers, captioned clips. They don't only go on X, either: I'll drop a rendered demo straight into a PR, like this one on atlas-lean, Facebook's AI research project.
HACKS
Build video in HyperFrames: write a script.md, have your agent render it to MP4.
Upload GIFs to catbox and they render beautifully on GitHub, in PRs, READMEs, and issues.
14. Your Notes Are Your Agent's Knowledge Base
The strategy-folder trick from March generalized. The reason a plan gets better every time is that Claude has access to every prior plan I've written. Compounding context. So I pointed it at my whole brain.
The tools I point it at:
Bear, with the Bear CLI. A decade of notes, meetings, half-baked ideas, and decisions an agent can read and write. Personal RAG without calling it that. The more I put in, the smarter every session gets.
Obsidian. I don't use it, but people love it for this and the plugin ecosystem is deep.
gbrain. My synced brain across machines and agents.
supermemory. A memory layer for agents a lot of people swear by. Digging in now, verdict to come.
The shape of the hack is the point: pick a notes tool with a CLI or an API, point your agent at it, and let your own knowledge compound.
HACKS
Point your agent at both: note-takers you write in (Bear, Obsidian) and agent brains that remember for you (gbrain, supermemory). Pick ones with a CLI or API so it can read them.
15. Work From Anywhere - My Mac mini
HACKS
Mosh, when you have to SSH in. It keeps the session local-feeling and responsive over bad wifi and roaming. On plain SSH, Claude Code crawls, every keystroke waiting on the round trip. The difference between usable and miserable on a remote box.
Tmux, for airplanes. SSH into your remote machine inside a tmux session and the work runs there, not on your laptop. Wifi drops for twenty minutes over the Atlantic, you reconnect, attach, and it's exactly where you left it. I've shipped features the whole flight home from Europe.
Hermes and OpenClaw, both running, for autonomous remote work. Hermes for the self-learning ecosystem that gets better at repeated tasks, OpenClaw for the breadth of agent-built skills. I swap between both. If you bailed on OpenClaw early, wipe it and start fresh.
Agent Cookie to keep cookies and .env's in sync between your Ma mini and your primary Mac.
16. Proof: For Sending a Plan to a Colleague
A plan.md is perfect for me and useless to hand to someone who doesn't live in a terminal. That was the last real gap, and Proof, also from Every, closed it.
Opening a plan in Proof to read it like a document is nice. But where it became essential is sending a plan to a colleague. I drop a plan.md or a spec into Proof, send the link, and a non-terminal human can read it cleanly, comment inline, and those comments flow back into the loop with the agent. No more pasting markdown into Slack and watching it render into garbage. It's human-in-the-loop review for the whole plan-file workflow, and it's the first time sharing agentic work with a normal coworker hasn't felt awkward.
I loaded this very article into Proof while I was writing it. That's how it got reviewed.
And I wrote this whole article in cmux with the Proof review open right alongside it:
cmux and Proof working together
HACKS
Share a plan: drop the .md into Proof, send the link, pull comments back into the loop.
17. Write Your Own Skills
The biggest level-up isn't using agents. It's teaching them tricks that stick. Anything I do more than twice, I turn into a skill: a reusable command my agents can run forever. Automate your workflows by writing your own skills first.
You don't write them from scratch. The trick that unlocked this for me is to point your agent at a skill that already works and have it copy the shape. Literally: "look at the Compound Engineering skill and help me make one like this for [whatever I'm trying to automate]." It reads a great example, learns the structure, and scaffolds mine. I've built a pile of skills this way.
This is also most of my open source life now. If you look at my GitHub, the work is skills and the tools around them. last30days started as a skill I wanted for myself and is now open source past 26K stars. Printing Press is a whole factory for generating agent-native CLIs, and it's my most-used personal tool, with over 320 merged PRs into it. I'm one of the top contributors to Compound Engineering itself. None of it was a grand plan. Each piece was a workflow I ran often enough that it was worth making the agent permanently good at it.
Write the skill once. Every session after is faster. That's the compounding part of Compound Engineering.
HACKS
Anything you do more than twice, make a skill: "look at the Compound Engineering skill and help me make one like this for [X]."
18. Open Source: Contribute to the Projects You Love
The same loop that ships my own projects ships everyone else's. I've had hundreds of PRs merged into open source, including Python, Go, OpenCV, Vercel's Agent Browser, and OpenClaw. Not drive-by typo fixes, real features on tools I use every day.
Somewhere along the way I started landing near the top of the contributor lists:
#3 on Compound Engineering, Superpowers, and Emdash
#4 on GStack and Paperclip
#6 on Vercel's Agent Browser
#2 on Camoufox
@pejmanjohn jokes that when he opens a repo, spotting my face in the contributor grid has become his personal game of "where's Waldo."
Contributors for Superpowers
But the merged PRs aren't the real prize. It's the people. I jump into the Discord, meet the maintainers, make actual friends. It's been incredible for hiring too, I just hired an engineer I met this way for my new company. You contribute to something you love, you meet the people who love it, and it compounds.
HACKS
Pick a tool you use every day, find one real thing it's missing, and ship it with the same /ce-plan + /ce-work loop.
Show up in the project's Discord. The PRs get you in the door; the people are why you stay.
Add value on X
On X Pay $1-3/month to subscribe to people you respect. I pay $1/month to @garrytan and when I submit a PR I can send an X post to him and he gets a special notification that I’m a paying customer. I also pay for @jason @teknium @Teknium.
19. My Current Laptop Setup
My two-year-old laptop was barely functional under everything I run on it, six Claude sessions plus Codex all day. So I upgraded to an M5 Max with 64GB of RAM. It's a beast and I love it. It also still gets wrecked by the workload: my brand new machine has lasted as little as an hour on battery.
So I panic-bought power. I carry an Anker battery brick everywhere now, and I keep an Anker charger in the Tesla so the car tops me up on the go.
HACKS
Never sleep: sudo pmset -a disablesleep 1. Carry an Anker battery brick; keep a charger in the car.
20. Printing Press: CLIs That Run Real Life
Most of these hacks live in the terminal. This is the one that leaves it. Printing Press is a fleet of CLIs that wrap real-world services so an agent can just do the errand. It's its own project now at @ppressdev, past 3.7K stars, and I'm building it with @trevin.
The piece that makes them actually work is auth, and that shipped last night: Agent Cookie. It hands a CLI your real browser session so it acts as you, no passwords to paste, nothing to re-auth. It's what turns "an agent that knows about a service" into "an agent that's logged into it."
A real afternoon, soup to nuts:
Tesla preheat. Kids in the car in ten minutes: "preheat the car to 72." The Tesla CLI fires, the car's warm before we walk out.
Instacart. "add Corona to Costco on Instacart." 
ESPN polling. A session watched a game for me and pinged me only when it got close. I didn't refresh anything, I got the one alert that mattered.
Alaska Airlines for the kids' trip. Pulled fares and shoulder dates, checked our Atmos balance, fed it into /ce-plan, got a booking strategy with the cheapest days and buy reminders. From a soccer field.
Not "AI writes my code." Agentic Engineering does the errands, watches the game, warms the car, and books the trip, while I'm doing something else.
HACKS
Install a ready-made CLI from the library at printingpress.dev to hand an errand straight to your agent.
Auth without the pain: Agent Cookie delivers your real browser session to a CLI so it acts as you.
The real hack: print your own. Take something you do all day, an API or a service you live in, and have Printing Press generate an agent-native CLI for it. The one you build for your own workflow is the one that changes how you work.
21. The Honest Part: AI Psychosis
Agents were supposed to do all the work for us. Instead, every friend I have is working the hardest they ever have in their lives.
The easy response is take a break, touch grass. But that's not what this is about. This is about addiction. Building with agents is the greatest video game ever made, and the loop is that good.
I have friends I genuinely worry about. They're so lit up by being able to build anything that they don't do anything else. Then they launch, and there are no users. And that is okay. I've launched plenty of things with no users. The trap isn't the empty launch, it's vanishing into the build and losing the people around you.
So be careful. Talk to your loved ones. Ask yourself if anyone actually wants the thing you're making. And if the honest answer is that it's just a tool for you, that's okay too. Some of the best things I've built were only ever for me.
If you do want an audience, it's the Gary Vaynerchuk path he always preached for content. You start somewhere, posting into the ether hoping one person notices. Then three, then ten, then a hundred, and you work your way to thousands. Nobody starts at thousands. Same with anything you build.
HACKS
Take breaks. Touch grass.
Talk to your loved ones.
Build something people want, even if "people" is just you.
22. This Article Was Written This Way
This is a markdown file. Claude Code in cmux, me talking into Monologue: "evolve the no-IDE opener," "make the don't-read-the-plan section spicier," "add the Tesla and Instacart story." It rewrites, I react, and it's in Proof for review. last30days fed the fresh material. No Zed this time, by the way. I stopped using it. No IDE. No typing code. Talk, plan, build. From a desk, a couch, a car, a soccer field.
That's everything I know in June. A voice app, a plan-file plugin, a couple of config changes, a pile of tabs, a Mac Mini, two remote boxes, and a fleet of CLIs that run real life.
HACKS
Copy this whole article, paste it into your agent, and tell it to set up everything it can. Good things will happen to your agentic engineering workflow.