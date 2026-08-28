const socket = io();

// UI Elements
const loginModal = document.getElementById('login-modal');
const usernameInput = document.getElementById('username-input');
const btnJoin = document.getElementById('btn-join');

const statusDiv = document.getElementById('status');
const boardDiv = document.getElementById('board');
const myHandDiv = document.getElementById('my-hand');

const btnStartGame = document.getElementById('btn-start-game');
const btnPass = document.getElementById('btn-pass');

const playerTop = document.getElementById('player-top');
const playerLeft = document.getElementById('player-left');
const playerRight = document.getElementById('player-right');

// Chat & Emoji Elements
const btnToggleChat = document.getElementById('btn-toggle-chat');
const chatBox = document.getElementById('chat-box');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const btnSendChat = document.getElementById('btn-send-chat');

// Game Over Modal Elements (Di Tengah Meja)
const gameOverModal = document.getElementById('game-over-modal');
const goWinnerName = document.getElementById('go-winner-name');
const goReason = document.getElementById('go-reason');
const btnCloseGo = document.getElementById('btn-close-go');

// Mode Permainan Selection (Tunggal / Ganda)
let selectedMode = 'single';

document.querySelectorAll('.btn-mode').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.btn-mode').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    selectedMode = e.target.getAttribute('data-mode');
  });
});

// 1. EFEK SUARA & AUDIO EMOJI EJEKAN
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;

function playCardSound() {
  if (!audioCtx) audioCtx = new AudioContext();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(320, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(90, audioCtx.currentTime + 0.08);
  gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.08);
}

// FUNGSI MEMUTAR FILE AUDIO EFEK SUARA / EJEKAN
function playSoundEffect(filename) {
  const audio = new Audio(`/sound/${filename}`);
  audio.volume = 0.7;
  audio.play().catch(e => console.log("Gagal memutar audio:", e));
}

// 2. KEMBANG API SAAT PEMAIN WIN
function triggerFireworks() {
  if (typeof confetti === 'function') {
    const duration = 3 * 1000;
    const end = Date.now() + duration;

    (function frame() {
      confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 } });
      confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 } });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
  }
}

// 3. GENERATE BULATAN TITIK DOMINO (0 - 6)
function createDominoHalf(value) {
  const half = document.createElement('div');
  half.className = 'domino-half';

  const positions = {
    0: [],
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8]
  };

  const activeDots = positions[value] || [];

  for (let i = 0; i < 9; i++) {
    const cell = document.createElement('div');
    if (activeDots.includes(i)) {
      const dot = document.createElement('div');
      dot.className = 'dot';
      cell.appendChild(dot);
    }
    half.appendChild(cell);
  }

  return half;
}

// 4. MASUK MEJA & KONTROL (DENGAN LANDSCAPE ORIENTATION LOCK OTOMATIS)
btnJoin.addEventListener('click', () => {
  const name = usernameInput.value.trim();
  if (name) {
    // Coba kunci layar ke mode landscape secara otomatis jika didukung browser HP
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock('landscape').catch(err => {
        console.log("Orientation lock tidak didukung atau ditolak:", err);
      });
    }

    socket.emit('join_game', { name: name, mode: selectedMode });
    loginModal.style.display = 'none';
  }
});

usernameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') btnJoin.click();
});

btnStartGame.addEventListener('click', () => socket.emit('start_game_req'));
btnPass.addEventListener('click', () => socket.emit('pass_turn'));

// Close Game Over Modal
if (btnCloseGo) {
  btnCloseGo.addEventListener('click', () => {
    gameOverModal.style.display = 'none';
  });
}

// 5. DRAG & DROP KE MEJA (DESKTOP)
boardDiv.addEventListener('dragover', (e) => {
  e.preventDefault();
  boardDiv.classList.add('drag-over');
});

boardDiv.addEventListener('dragleave', () => {
  boardDiv.classList.remove('drag-over');
});

boardDiv.addEventListener('drop', (e) => {
  e.preventDefault();
  boardDiv.classList.remove('drag-over');
  const index = e.dataTransfer.getData('text/plain');
  if (index !== undefined && index !== '') {
    playCardSound();
    socket.emit('play_card', parseInt(index));
  }
});

// 6. RENDER KARTU TANGAN
function renderHand(cards) {
  myHandDiv.innerHTML = '';
  cards.forEach((card, index) => {
    const cardEl = document.createElement('div');
    cardEl.className = 'card';
    cardEl.draggable = true;

    const topHalf = createDominoHalf(card[0]);
    const divider = document.createElement('div');
    divider.className = 'card-divider';
    const bottomHalf = createDominoHalf(card[1]);

    cardEl.appendChild(topHalf);
    cardEl.appendChild(divider);
    cardEl.appendChild(bottomHalf);

    // Klik kartu
    cardEl.addEventListener('click', () => {
      playCardSound();
      socket.emit('play_card', index);
    });

    // Drag PC
    cardEl.addEventListener('dragstart', (e) => {
      cardEl.classList.add('dragging');
      e.dataTransfer.setData('text/plain', index);
    });

    cardEl.addEventListener('dragend', () => {
      cardEl.classList.remove('dragging');
    });

    // Touch Drag HP
    let touchLocation;
    cardEl.addEventListener('touchmove', (e) => {
      touchLocation = e.targetTouches[0];
      cardEl.style.position = 'fixed';
      cardEl.style.left = (touchLocation.clientX - 22) + 'px';
      cardEl.style.top = (touchLocation.clientY - 40) + 'px';
      cardEl.style.zIndex = '1000';
    });

    cardEl.addEventListener('touchend', () => {
      cardEl.style.position = 'static';
      cardEl.style.zIndex = '1';

      if (touchLocation) {
        const rect = boardDiv.getBoundingClientRect();
        if (
          touchLocation.clientX >= rect.left &&
          touchLocation.clientX <= rect.right &&
          touchLocation.clientY >= rect.top &&
          touchLocation.clientY <= rect.bottom
        ) {
          playCardSound();
          socket.emit('play_card', index);
        }
      }
    });

    myHandDiv.appendChild(cardEl);
  });
}

// 7. RENDER KARTU MEJA (DENGAN PENYESUAIAN POSISI BALAK VERTIKAL)
function renderBoard(board) {
  boardDiv.innerHTML = '';
  if (!board || board.length === 0) return;

  board.forEach(card => {
    const cardEl = document.createElement('div');
    
    // Cek apakah kartu adalah balak (angka kembar, misal 3-3, 6-6)
    // Jika ya, tambahkan kelas 'vertical' agar kartu berdiri tegak di meja
    const isDouble = (card[0] === card[1]);
    cardEl.className = isDouble ? 'card-board vertical' : 'card-board';

    const topHalf = createDominoHalf(card[0]);
    const divider = document.createElement('div');
    divider.className = 'card-divider';
    const bottomHalf = createDominoHalf(card[1]);

    cardEl.appendChild(topHalf);
    cardEl.appendChild(divider);
    cardEl.appendChild(bottomHalf);

    boardDiv.appendChild(cardEl);
  });
}

// Helper untuk membuat atau memperbarui elemen badge tim di slot pemain
function updatePlayerSlotContent(el, opponent) {
  el.querySelector('.p-name').innerText = opponent.name;
  el.querySelector('.p-cards').innerText = `Kartu: ${opponent.cardCount}`;

  let teamBadge = el.querySelector('.p-team');
  if (opponent.team !== null && opponent.team !== undefined) {
    if (!teamBadge) {
      teamBadge = document.createElement('span');
      teamBadge.className = 'p-team';
      el.appendChild(teamBadge);
    }
    teamBadge.innerText = `Tim ${opponent.team + 1}`;
    teamBadge.style.display = 'block';
  } else {
    if (teamBadge) {
      teamBadge.style.display = 'none';
    }
  }
}

// 8. UPDATE STATE REALTIME
socket.on('update_board', (data) => {
  renderBoard(data.board);

  if (data.myHand) renderHand(data.myHand);
  btnPass.disabled = !data.canPass;

  if (data.isStarted) {
    btnStartGame.style.display = 'none';
    statusDiv.innerText = data.isMyTurn ? 'GILIRAN KAMU!' : 'Menunggu giliran lawan...';
    statusDiv.style.color = data.isMyTurn ? '#f1c40f' : '#ffffff';
  } else {
    btnStartGame.style.display = 'inline-block';
    statusDiv.innerText = 'Selamat Bertanding Turnamen Gaple Online';
    statusDiv.style.color = '#4ade80';
  }

  const opponents = data.playersSummary.filter(p => p.id !== socket.id);
  [playerLeft, playerTop, playerRight].forEach(el => {
    if (el) {
      el.classList.remove('active-turn');
      el.querySelector('.p-name').innerText = 'Kosong';
      el.querySelector('.p-cards').innerText = 'Kartu: -';
      const teamBadge = el.querySelector('.p-team');
      if (teamBadge) teamBadge.style.display = 'none';
    }
  });

  if (opponents[0] && playerLeft) {
    updatePlayerSlotContent(playerLeft, opponents[0]);
    if (opponents[0].isTurn) playerLeft.classList.add('active-turn');
  }
  if (opponents[1] && playerTop) {
    updatePlayerSlotContent(playerTop, opponents[1]);
    if (opponents[1].isTurn) playerTop.classList.add('active-turn');
  }
  if (opponents[2] && playerRight) {
    updatePlayerSlotContent(playerRight, opponents[2]);
    if (opponents[2].isTurn) playerRight.classList.add('active-turn');
  }
});

// 9. GAME OVER (BANNER DI TENGAH MEJA)
socket.on('game_over', (data) => {
  triggerFireworks();

  if (goWinnerName) goWinnerName.innerText = `Pemenang: ${data.winner}`;
  if (goReason) goReason.innerText = data.reason;

  if (gameOverModal) {
    gameOverModal.style.display = 'block';
  }
});

// 10. INTERAKSI KLIK PROFIL PEMAIN & MENU REAKSI EMOJI / SUARA
[playerTop, playerLeft, playerRight].forEach(slot => {
  if (!slot) return;
  slot.addEventListener('click', (e) => {
    const nameText = slot.querySelector('.p-name').innerText;
    if (nameText === 'Kosong') return;

    // Tutup menu profil lain yang terbuka
    document.querySelectorAll('.profile-reaction-menu').forEach(menu => {
      if (menu !== slot.querySelector('.profile-reaction-menu')) {
        menu.style.display = 'none';
      }
    });

    const menu = slot.querySelector('.profile-reaction-menu');
    if (menu) {
      menu.style.display = menu.style.display === 'flex' ? 'none' : 'flex';
    }
  });
});

// Tangani klik emoji pada menu profil
document.querySelectorAll('.btn-profile-emoji').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation(); // Mencegah event klik tembus ke slot
    const soundFile = btn.getAttribute('data-sound');

    if (soundFile) {
      playSoundEffect(soundFile);
      socket.emit('play_sound_effect', soundFile);
    }

    // Sembunyikan semua menu reaksi setelah dipilih
    document.querySelectorAll('.profile-reaction-menu').forEach(menu => {
      menu.style.display = 'none';
    });
  });
});

// 11. CHAT & EMOJI TEKS BIASA DI CHAT BOX
btnToggleChat.addEventListener('click', () => {
  chatBox.style.display = chatBox.style.display === 'none' ? 'flex' : 'none';
});

document.querySelectorAll('.btn-emoji').forEach(btn => {
  btn.addEventListener('click', () => {
    const emoji = btn.innerText;
    chatInput.value += emoji;
    chatInput.focus();
  });
});

// Menerima trigger suara dari pemain lain
socket.on('trigger_sound', (soundFile) => {
  playSoundEffect(soundFile);
});

function sendChatMessage() {
  const text = chatInput.value.trim();
  if (text) {
    socket.emit('send_message', text);
    chatInput.value = '';
  }
}

btnSendChat.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendChatMessage();
});

socket.on('receive_message', (data) => {
  const p = document.createElement('div');
  p.style.marginBottom = '4px';
  p.innerHTML = `<strong style="color:#fde047;">${data.sender}:</strong> ${data.text}`;
  chatMessages.appendChild(p);
  chatMessages.scrollTop = chatMessages.scrollHeight;
});
