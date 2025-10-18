# Screen Recording & Audio Best Practices

**Professional guide to recording high-quality video tutorials with excellent audio and visual clarity.**

## 🎥 Recording Overview

High-quality recordings form the foundation of effective video tutorials. This guide covers equipment selection, setup procedures, recording techniques, and troubleshooting for professional results.

## 📦 Equipment Requirements

### Essential Equipment

#### 🎤 Audio Equipment
```markdown
**Minimum Requirements:**
- USB microphone (Blue Yeti, Audio-Technica ATR2100x-USB)
- Closed-back headphones for monitoring
- Quiet recording environment
- Pop filter or windscreen

**Professional Setup:**
- XLR microphone (Shure SM7B, Electro-Voice RE20)
- Audio interface (Focusrite Scarlett 2i2, PreSonus AudioBox)
- Acoustic treatment (foam panels, reflection filter)
- Professional headphones (Sony MDR-7506, Audio-Technica ATH-M50x)
```

#### 📺 Video Equipment
```markdown
**Screen Recording:**
- High-resolution monitor (1080p minimum, 1440p preferred)
- Stable internet connection (for cloud-based tools)
- Sufficient storage space (10GB+ for hour-long recordings)

**Optional Camera (for presenter view):**
- HD webcam (Logitech C920, C922 Pro)
- DSLR camera with capture card
- Proper lighting setup
- Clean, professional background
```

#### 💻 Computer Requirements
```markdown
**Minimum Specifications:**
- CPU: Intel i5 / AMD Ryzen 5 (4+ cores)
- RAM: 16GB (8GB recording + 8GB system)
- Storage: SSD with 100GB+ free space
- GPU: Dedicated graphics card (recommended)

**Recommended Specifications:**
- CPU: Intel i7 / AMD Ryzen 7 (8+ cores)
- RAM: 32GB (future-proofing and multitasking)
- Storage: NVMe SSD with 500GB+ free space
- GPU: Modern dedicated GPU for hardware encoding
```

### Software Recommendations

#### 📹 Screen Recording Software
```markdown
**Free Options:**
- OBS Studio (Open source, highly customizable)
- QuickTime Player (macOS, simple and reliable)
- Xbox Game Bar (Windows 10/11, built-in)
- SimpleScreenRecorder (Linux, lightweight)

**Professional Options:**
- Camtasia (User-friendly, built-in editing)
- ScreenFlow (macOS, professional features)
- Bandicam (Windows, high performance)
- DemoCreator (Cross-platform, AI features)

**Browser-Based:**
- Loom (Quick sharing, cloud storage)
- Screencastify (Chrome extension)
- RecordCast (No installation required)
```

#### 🎧 Audio Software
```markdown
**Recording:**
- Audacity (Free, cross-platform)
- GarageBand (macOS, user-friendly)
- Reaper (Professional, affordable)
- Adobe Audition (Industry standard)

**Real-time Processing:**
- VoiceMeeter (Windows, audio routing)
- SoundSource (macOS, per-app audio control)
- PulseAudio (Linux, advanced audio management)
```

## 🎬 Recording Setup

### Environment Preparation

#### 🏠 Recording Space
```markdown
**Acoustic Considerations:**
- Choose quiet room away from traffic/noise
- Use soft furnishings to reduce echo
- Record during quiet times of day
- Inform household members of recording schedule

**Visual Setup:**
- Clean, organized desktop
- Consistent color scheme and fonts
- Remove personal/confidential information
- Use high-contrast themes for visibility

**Lighting (if using camera):**
- Natural light from front (not behind)
- Avoid harsh shadows and glare
- Consistent lighting throughout recording
- Test lighting at actual recording time
```

#### 💱 Technical Setup
```markdown
**Display Configuration:**
```bash
# Set optimal recording resolution
# 1920x1080 for full HD
# Scale UI to 125% for better readability
# Use consistent window sizes

# macOS display settings
system_profiler SPDisplaysDataType

# Windows display settings
displayswitch /internal

# Linux display settings
xrandr --output HDMI-1 --mode 1920x1080 --rate 60
```

**Audio Configuration:**
```bash
# Test microphone levels
# Aim for -12dB to -6dB average levels
# Set sample rate to 48kHz for video
# Use mono recording for narration

# macOS audio test
system_profiler SPAudioDataType

# Windows audio test
sndvol

# Linux audio test
arecord -l
pulseaudio --check
```

**Software Preparation:**
```bash
# Close unnecessary applications
# Disable notifications
# Set recording software priority
# Prepare all demo files and projects

# Disable notifications (macOS)
defaults write com.apple.notificationcenterui bannerTime 0

# Disable notifications (Windows)
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Notifications\Settings" /v NOC_GLOBAL_SETTING_ALLOW_NOTIFICATION_SOUND /t REG_DWORD /d 0

# Prepare demo environment
mkdir ~/recording-demo
cd ~/recording-demo
git clone https://github.com/ruvnet/claude-flow-novice
npm install
```
```

### Recording Configuration

#### 🎥 Video Settings
```markdown
**OBS Studio Configuration:**

**Scene Setup:**
1. Add Display Capture source
2. Set resolution to 1920x1080 (1080p)
3. Frame rate: 30fps (60fps for fast-paced content)
4. Format: MP4 with H.264 encoding

**Advanced Settings:**
- Encoder: Hardware (NVENC/AMD) if available, otherwise x264
- Rate Control: CBR (Constant Bitrate)
- Bitrate: 5000-8000 Kbps for local recording
- Keyframe Interval: 2 seconds
- Preset: Quality (for x264) or High Quality (for hardware)

**Audio Settings:**
- Sample Rate: 48kHz
- Channels: Mono or Stereo
- Bitrate: 160-320 Kbps
```

#### 🎤 Audio Optimization
```markdown
**Microphone Setup:**
1. Position 6-8 inches from mouth
2. Use pop filter to reduce plosives
3. Set input gain to -12dB average
4. Enable noise suppression if needed
5. Record in quiet environment

**Recording Levels:**
- Peak levels: Never exceed -6dB
- Average levels: -12dB to -18dB
- Noise floor: Below -50dB
- Dynamic range: Maintain consistent volume

**Real-time Processing:**
```bash
# OBS Audio Filters (in order):
1. Noise Suppression (-30dB)
2. Noise Gate (Open: -35dB, Close: -40dB)
3. Compressor (Ratio: 3:1, Threshold: -18dB)
4. Limiter (Threshold: -6dB, Release: 60ms)
```
```

## 🎬 Recording Techniques

### 🎨 Visual Techniques

#### Screen Preparation
```markdown
**Desktop Organization:**
- Use clean, professional wallpaper
- Hide desktop icons or use organized layout
- Close unnecessary applications
- Use consistent window sizes and positions

**Application Setup:**
- Increase font sizes for readability
- Use high-contrast themes
- Adjust terminal/IDE color schemes
- Set appropriate zoom levels

**Browser Configuration:**
- Use clean browser profile
- Install minimal extensions
- Clear bookmarks toolbar
- Set appropriate zoom (110-125%)
```

#### Cursor and Highlighting
```markdown
**Cursor Techniques:**
- Move deliberately and smoothly
- Pause on important elements
- Use cursor to guide attention
- Avoid rapid, erratic movements

**Visual Emphasis:**
- Use built-in zoom features
- Add temporary highlights or annotations
- Circle or underline important text
- Use arrows to point to key elements

**Screen Annotations:**
```javascript
// OBS Studio hotkeys for annotations
// Set up hotkeys for:
- Toggle annotation layer (F1)
- Clear all annotations (F2)
- Add arrow pointer (F3)
- Add text overlay (F4)
```
```

### 🎤 Audio Techniques

#### Narration Best Practices
```markdown
**Speaking Techniques:**
- Speak 10-15% slower than normal conversation
- Use clear enunciation and pronunciation
- Vary tone and pace to maintain interest
- Pause after important concepts

**Script Delivery:**
- Sound natural, not robotic
- Use conversational tone
- Include vocal emphasis on key points
- Allow for natural breathing pauses

**Common Audio Issues:**
- Mouth noises: Stay hydrated, avoid caffeine
- Breathing sounds: Position mic to side
- Echo/reverb: Add acoustic treatment
- Background noise: Use noise gate/suppression
```

#### Synchronization
```markdown
**Audio-Visual Sync:**
- Start narration slightly before action
- Pause narration during complex operations
- Describe what viewers see happening
- Use transitions between major sections

**Timing Techniques:**
- Allow time for viewers to read text
- Pause after questions (even if rhetorical)
- Give time to absorb complex information
- Match speaking pace to action complexity
```

### 📱 Recording Workflow

#### Pre-Recording Checklist
```markdown
**30 Minutes Before:**
- [ ] Test all equipment and software
- [ ] Set up recording environment
- [ ] Prepare demo files and projects
- [ ] Review script and talking points
- [ ] Check audio levels and video quality

**5 Minutes Before:**
- [ ] Close unnecessary applications
- [ ] Disable notifications and interruptions
- [ ] Set phone to silent mode
- [ ] Do final audio/video test
- [ ] Take a few deep breaths and relax

**Recording Start:**
- [ ] Start recording with 10-second buffer
- [ ] State tutorial name and take number
- [ ] Begin with standard introduction
- [ ] Proceed with planned content
```

#### During Recording
```markdown
**Best Practices:**
- Speak to the audience, not the screen
- Explain what you're doing before doing it
- Acknowledge and correct mistakes naturally
- Take breaks when needed (edit out later)
- Stay hydrated and maintain energy

**Error Handling:**
- Don't stop recording for minor mistakes
- Use verbal cues for editing ("Let me try that again")
- Pause and restart complex sections if needed
- Mark significant errors with clap or verbal note

**Quality Monitoring:**
- Check audio levels periodically
- Ensure screen content is visible and readable
- Verify recording is actually capturing
- Monitor for technical issues or lag
```

#### Post-Recording
```markdown
**Immediate Actions:**
- [ ] Save recording with descriptive filename
- [ ] Create backup copy to different location
- [ ] Review recording quality quickly
- [ ] Note any issues for editing phase
- [ ] Export/render in appropriate format

**File Organization:**
```bash
# Recommended file naming convention
YYYY-MM-DD_TutorialName_TakeNumber_Version
# Example: 2024-09-26_ClaudeFlowSetup_Take02_v1.mp4

# Directory structure
recordings/
├── raw/                 # Original recordings
├── processed/          # Edited versions
├── assets/             # Supporting files
└── exports/            # Final versions
```
```

## 🔧 Troubleshooting

### Common Recording Issues

#### Audio Problems
```markdown
**Low Audio Quality:**
- Check microphone positioning (6-8 inches from mouth)
- Verify input levels (-12dB to -18dB average)
- Test different sample rates (48kHz recommended)
- Use pop filter and proper acoustic treatment

**Audio Sync Issues:**
- Ensure audio and video use same sample rate
- Check for buffer overflow in recording software
- Use wired headphones instead of Bluetooth
- Close other audio applications during recording

**Background Noise:**
- Use noise suppression filters
- Record during quieter times
- Improve acoustic treatment of room
- Use directional microphone patterns
```

#### Video Problems
```markdown
**Poor Video Quality:**
- Increase recording bitrate (5000-8000 Kbps)
- Use hardware encoding if available
- Record at native monitor resolution
- Ensure sufficient disk space and CPU resources

**Choppy/Laggy Recording:**
- Close unnecessary applications
- Lower recording quality temporarily
- Use faster storage (SSD recommended)
- Update graphics drivers

**Display Issues:**
- Use consistent scaling across monitors
- Avoid recording during high CPU tasks
- Test with different recording regions
- Verify monitor refresh rate settings
```

#### Software-Specific Solutions

##### OBS Studio
```markdown
**Common OBS Issues:**

**High CPU Usage:**
```bash
# Reduce CPU load
- Use hardware encoding (NVENC/AMF)
- Lower output resolution
- Reduce frame rate to 30fps
- Close preview window during recording
```

**Audio Delay:**
```bash
# Fix audio sync
1. Right-click audio source
2. Select "Advanced Audio Properties"
3. Adjust "Sync Offset" in milliseconds
4. Test with clap test
```

**Recording Stutters:**
```bash
# Performance optimization
1. Settings > Output > Recording
2. Set Rate Control to "CBR"
3. Enable "Rescale Output" to 1080p
4. Use "fast" x264 preset
```
```

##### Camtasia
```markdown
**Camtasia Optimization:**

**Large File Sizes:**
- Use Smart Player format for editing
- Reduce canvas dimensions if needed
- Optimize export settings for target platform
- Use variable bitrate encoding

**Slow Performance:**
- Enable hardware acceleration
- Clear media cache regularly
- Work with proxy media for large files
- Close other applications during editing
```

### Performance Optimization

#### System Optimization
```bash
# Windows performance tweaks
# Set recording software to high priority
wmic process where name="obs64.exe" CALL setpriority "high priority"

# Disable Windows Game Mode during recording
reg add "HKCU\Software\Microsoft\GameBar" /v AllowAutoGameMode /t REG_DWORD /d 0

# macOS performance tweaks
# Increase recording software priority
sudo renice -10 -p $(pgrep OBS)

# Disable Spotlight indexing during recording
sudo mdutil -a -i off

# Linux performance tweaks
# Set CPU governor to performance
echo performance | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor

# Increase recording process priority
sudo nice -n -10 obs
```

#### Storage Optimization
```markdown
**Recording Storage:**
- Use fastest available storage (NVMe SSD)
- Ensure 10GB+ free space per hour of recording
- Use separate drive for recordings vs system
- Monitor disk space during long recordings

**Backup Strategy:**
- Immediate backup to second location
- Cloud backup for important recordings
- Version control for edited content
- Regular cleanup of old raw recordings
```

## 📊 Quality Standards

### Technical Quality Metrics
```markdown
**Video Quality:**
- Resolution: 1920x1080 minimum
- Frame rate: 30fps (60fps for fast-paced content)
- Bitrate: 5000-8000 Kbps for local, 2000-4000 for streaming
- Codec: H.264 for compatibility

**Audio Quality:**
- Sample rate: 48kHz
- Bit depth: 16-bit minimum, 24-bit preferred
- Levels: -12dB to -18dB average, never exceed -6dB
- Noise floor: Below -50dB

**Content Quality:**
- All text clearly readable at 1080p
- Cursor movements smooth and purposeful
- Audio sync within 40ms of video
- No distracting background noise
```

### Content Standards
```markdown
**Educational Effectiveness:**
- Clear learning objectives stated upfront
- Logical progression of concepts
- Practical examples with real-world relevance
- Common mistakes and solutions addressed

**Production Values:**
- Professional audio quality throughout
- Consistent visual presentation
- Smooth transitions between sections
- Appropriate pacing for content complexity
```

## 🎆 Advanced Techniques

### Multi-Camera Setup
```markdown
**When to Use Multiple Angles:**
- Long-form tutorials (>20 minutes)
- Complex demonstrations requiring detail
- Interview or collaboration formats
- Professional production requirements

**Setup Considerations:**
- Sync all cameras to same timecode
- Use consistent lighting across angles
- Plan switching points during scripting
- Test all angles before recording
```

### Interactive Elements
```markdown
**Screen Annotations:**
- Use sparingly to avoid distraction
- Ensure annotations are large enough to see
- Use consistent style and colors
- Remove annotations when no longer needed

**Call-to-Action Overlays:**
- Subscribe reminders (not too frequent)
- Related video suggestions
- Download links for resources
- Community engagement prompts
```

### Live Recording Considerations
```markdown
**Live vs Pre-recorded:**
- Live: More authentic, but higher risk
- Pre-recorded: Better quality control
- Hybrid: Record live, edit for final version

**Live Recording Best Practices:**
- Have backup plans for technical issues
- Practice the entire tutorial beforehand
- Use reliable internet and equipment
- Engage with audience appropriately
```

---

## 🚀 Quick Start

**New to recording?** Start with the [Basic Setup Guide](./basic-setup.md) and [Equipment Recommendations](./equipment.md).

**Want professional quality?** Review [Advanced Techniques](./advanced-techniques.md) and [Quality Standards](./quality-standards.md).

**Having technical issues?** Check the [Troubleshooting Guide](./troubleshooting.md) or ask in our [Creator Community](../community/creator-support.md).

---

*Great recordings are the foundation of effective tutorials. Invest in good equipment and technique to create content that truly helps your audience learn.*