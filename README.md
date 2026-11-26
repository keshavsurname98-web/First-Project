# First-Project
Build Orbit Lab, a browser-based gravity sandbox and checkpoint game. It should feel like a small observatory instrument that invites people to experiment.

Use plain HTML, CSS, and JavaScript. The project should run by opening index.html and be ready to host on GitHub Pages. Keep the code readable for a beginner.

Sandbox mode
- Put a fixed star named Sol at the center. Each planet is attracted by Sol.
- Click or tap to launch a planet at circular-orbit speed. Drag to aim, with longer drags producing faster launches. Show a dashed trajectory preview while aiming.
- Include Stable Orbits, Close Flyby, Collision Course, and Empty Field presets.
- Let players pause, reset, change simulation speed, adjust star gravity, and toggle orbital trails. Show when a planet collides with Sol or escapes.

Flight School mode
- Create three courses called First Orbit, Inside Track, and The Slingshot.
- Start each course from a marked launch pad and require players to pass through numbered checkpoints in order before time runs out.
- Show checkpoint progress, remaining time, and attempt count. Make retries quick and save each course’s best attempt count in localStorage.
- Support keyboard aiming and launching alongside mouse and touch.

Design and motion
- Use a dark observatory theme with white stars, amber controls, and readable orbital trails.
- Keep the animated Galaxy website backdrop separate from the starfield inside the game. Give each a toggle.
- Use TechText for the main headings, a subtle Magnet effect on primary buttons, and AnimatedContent-style entrances for the intro and guide. Preserve fixed click targets and respect reduced motion.
- Use fixed physics time steps and interpolate rendered positions for smooth orbital motion. Give launches and checkpoint hits brief visual feedback.

