// Basic track list – adjust paths and metadata to your files
const tracks = [
  {
    id: 1,
    title: "Ocean Breeze",
    artist: "Calm Tides",
    src: "music/ocean-breeze.mp3",
    image: "images/ocean-breeze.jpg",
  },
  {
    id: 2,
    title: "Morning Shells",
    artist: "Seaside Ensemble",
    src: "music/morning-shells.mp3",
    image: "images/morning-shells.jpg",
  },
  {
    id: 3,
    title: "Paper Waves",
    artist: "Soft Current",
    src: "music/paper-waves.mp3",
    image: "images/paper-waves.jpg",
  },
];

const songListEl = document.getElementById("songList");
const searchInput = document.getElementById("searchInput");

const audio = document.getElementById("audioElement");
const playerImage = document.getElementById("playerImage");
const playerTitle = document.getElementById("playerTitle");
const playerArtist = document.getElementById("playerArtist");

const playPauseBtn = document.getElementById("playPauseBtn");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const progressBar = document.getElementById("progressBar");
const currentTimeEl = document.getElementById("currentTime");
const durationEl = document.getElementById("duration");
const volumeSlider = document.getElementById("volumeSlider");
const shareBtn = document.getElementById("shareBtn");

let currentIndex = -1;
let isPlaying = false;

// Render song list
function renderSongList(filter = "") {
  songListEl.innerHTML = "";
  const normalizedFilter = filter.trim().toLowerCase();

  tracks
    .filter((track) => {
      if (!normalizedFilter) return true;
      return (
        track.title.toLowerCase().includes(normalizedFilter) ||
        track.artist.toLowerCase().includes(normalizedFilter)
      );
    })
    .forEach((track, index) => {
      const li = document.createElement("li");
      li.className = "song-item";
      li.dataset.index = index;

      const img = document.createElement("img");
      img.className = "song-thumb";
      img.src = track.image || "images/default.jpg";
      img.alt = track.title;

      const meta = document.createElement("div");
      meta.className = "song-meta";

      const title = document.createElement("p");
      title.className = "song-title";
      title.textContent = track.title;

      const artist = document.createElement("p");
      artist.className = "song-artist";
      artist.textContent = track.artist;

      meta.appendChild(title);
      meta.appendChild(artist);

      const duration = document.createElement("span");
      duration.className = "song-duration";
      duration.textContent = ""; // filled after metadata load if desired

      li.appendChild(img);
      li.appendChild(meta);
      li.appendChild(duration);

      li.addEventListener("click", () => {
        loadTrack(index);
        playTrack();
      });

      songListEl.appendChild(li);
    });

  highlightActiveItem();
}

function highlightActiveItem() {
  const items = songListEl.querySelectorAll(".song-item");
  items.forEach((item) => item.classList.remove("active"));
  if (currentIndex >= 0) {
    const active = songListEl.querySelector(
      `.song-item[data-index="${currentIndex}"]`
    );
    if (active) active.classList.add("active");
  }
}

// Load a track into the player
function loadTrack(index) {
  if (index < 0 || index >= tracks.length) return;
  currentIndex = index;
  const track = tracks[index];

  audio.src = track.src;
  playerTitle.textContent = track.title;
  playerArtist.textContent = track.artist;
  playerImage.src = track.image || "images/default.jpg";

  isPlaying = false;
  updatePlayPauseButton();
  highlightActiveItem();
}

// Play / pause logic
function playTrack() {
  if (currentIndex === -1 && tracks.length > 0) {
    loadTrack(0);
  }
  audio
    .play()
    .then(() => {
      isPlaying = true;
      updatePlayPauseButton();
    })
    .catch((err) => {
      console.error("Playback error:", err);
    });
}

function pauseTrack() {
  audio.pause();
  isPlaying = false;
  updatePlayPauseButton();
}

function togglePlayPause() {
  if (!audio.src) {
    loadTrack(0);
    playTrack();
    return;
  }
  if (isPlaying) {
    pauseTrack();
  } else {
    playTrack();
  }
}

function updatePlayPauseButton() {
  playPauseBtn.textContent = isPlaying ? "⏸" : "▶";
}

// Previous / next
function playNext() {
  if (tracks.length === 0) return;
  const nextIndex = (currentIndex + 1) % tracks.length;
  loadTrack(nextIndex);
  playTrack();
}

function playPrev() {
  if (tracks.length === 0) return;
  const prevIndex =
    (currentIndex - 1 + tracks.length) % tracks.length;
  loadTrack(prevIndex);
  playTrack();
}

// Time formatting
function formatTime(seconds) {
  if (isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

// Progress bar updates
audio.addEventListener("timeupdate", () => {
  if (!audio.duration) return;
  const progress = (audio.currentTime / audio.duration) * 100;
  progressBar.value = progress;
  currentTimeEl.textContent = formatTime(audio.currentTime);
});

audio.addEventListener("loadedmetadata", () => {
  durationEl.textContent = formatTime(audio.duration);
});

progressBar.addEventListener("input", () => {
  if (!audio.duration) return;
  const newTime = (progressBar.value / 100) * audio.duration;
  audio.currentTime = newTime;
});

// Volume
audio.volume = parseFloat(volumeSlider.value);

volumeSlider.addEventListener("input", () => {
  audio.volume = parseFloat(volumeSlider.value);
});

// Share button
shareBtn.addEventListener("click", async () => {
  if (currentIndex === -1) return;
  const track = tracks[currentIndex];
  const shareData = {
    title: `Listening to ${track.title}`,
    text: `I'm listening to "${track.title}" by ${track.artist} on Seashell.`,
    url: window.location.href,
  };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
    } catch (err) {
      console.error("Share cancelled or failed:", err);
    }
  } else {
    navigator.clipboard
      .writeText(`${shareData.text} ${shareData.url}`)
      .then(() => {
        alert("Share link copied to clipboard!");
      })
      .catch(() => {
        alert("Could not copy share link.");
      });
  }
});

// Search
searchInput.addEventListener("input", (e) => {
  renderSongList(e.target.value);
});

// Buttons
playPauseBtn.addEventListener("click", togglePlayPause);
nextBtn.addEventListener("click", playNext);
prevBtn.addEventListener("click", playPrev);

// Auto-next when track ends
audio.addEventListener("ended", playNext);

// Initial render
renderSongList();
