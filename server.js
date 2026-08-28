const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// DEK KARTU GAPLE / DOMINO (28 KARTU)
const FULL_DECK = [
  [0,0], [0,1], [0,2], [0,3], [0,4], [0,5], [0,6],
  [1,1], [1,2], [1,3], [1,4], [1,5], [1,6],
  [2,2], [2,3], [2,4], [2,5], [2,6],
  [3,3], [3,4], [3,5], [3,6],
  [4,4], [4,5], [4,6],
  [5,5], [5,6],
  [6,6]
];

let players = []; 
let gameMode = 'single'; // 'single' (tunggal) atau 'team' (ganda)
let tablePot = 0;        // Variabel penampung koin pot di tengah meja

let gameState = {
  board: [],
  leftValue: null,
  rightValue: null,
  turnIndex: 0,
  isStarted: false,
  consecutivePasses: 0 // Penghitung berapa kali PASS berturut-turut
};

function shuffle(array) {
  let deck = [...array];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function hasValidMove(hand, leftVal, rightVal) {
  if (leftVal === null && rightVal === null) return true;
  return hand.some(card => 
    card[0] === leftVal || card[1] === leftVal || 
    card[0] === rightVal || card[1] === rightVal
  );
}

// FUNGSI MENGHITUNG TOTAL TITIK KARTU DI TANGAN
function calculateHandScore(hand) {
  return hand.reduce((sum, card) => sum + card[0] + card[1], 0);
}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // GABUNG KAMAR DENGAN MENDUKUNG MODE (TUNGGAL / GANDA)
  socket.on('join_game', (data) => {
    const name = typeof data === 'object' && data !== null ? data.name : data;
    const mode = typeof data === 'object' && data !== null ? data.mode : 'single';

    if (players.length >= 4) {
      socket.emit('receive_message', { sender: 'System', text: 'Meja penuh (Maksimal 4 pemain).' });
      return;
    }

    // Jika ini pemain pertama, tetapkan mode permainan meja
    if (players.length === 0) {
      gameMode = mode;
      tablePot = 0; // Reset pot saat meja baru dimulai
    }

    // Tentukan pembagian tim jika mode 'team' (Ganda: Tim 0 untuk idx 0 & 2, Tim 1 untuk idx 1 & 3)
    const assignedTeam = gameMode === 'team' ? (players.length % 2) : null;

    const newPlayer = {
      id: socket.id,
      name: name || `Pemain ${players.length + 1}`,
      hand: [],
      coins: 10000, // Saldo awal koin pemain
      team: assignedTeam
    };

    players.push(newPlayer);
    socket.emit('connected_success', { myId: socket.id });
    
    const modeText = gameMode === 'team' ? 'Ganda (Team)' : 'Tunggal (Single)';
    io.emit('receive_message', { sender: 'System', text: `${newPlayer.name} telah bergabung ke meja (${modeText}).` });
    broadcastGameState();
  });

  // TOMBOL MULAI GAME
  socket.on('start_game_req', () => {
    if (players.length < 2) {
      socket.emit('receive_message', { sender: 'System', text: 'Minimal butuh 2 pemain untuk memulai!' });
      return;
    }
    startGame();
  });

  function startGame() {
    gameState.isStarted = true;
    gameState.board = [];
    gameState.leftValue = null;
    gameState.rightValue = null;
    gameState.consecutivePasses = 0;

    const deck = shuffle(FULL_DECK);
    const cardsPerPlayer = 7;

    players.forEach((p, index) => {
      p.hand = deck.slice(index * cardsPerPlayer, (index + 1) * cardsPerPlayer);
    });

    gameState.turnIndex = 0;

    io.emit('receive_message', { sender: 'System', text: '🎮 Game dimulai! Semua pemain telah menerima kartu.' });
    broadcastGameState();
  }

  // MAIN KARTU
  socket.on('play_card', (cardIndex) => {
    if (!gameState.isStarted) return;

    const currentPlayer = players[gameState.turnIndex];
    if (!currentPlayer || currentPlayer.id !== socket.id) {
      socket.emit('receive_message', { sender: 'System', text: 'Bukan giliranmu!' });
      return;
    }

    const card = currentPlayer.hand[cardIndex];
    if (!card) return;

    // Kartu Pertama di Meja
    if (gameState.board.length === 0) {
      currentPlayer.hand.splice(cardIndex, 1);
      gameState.board.push(card);
      gameState.leftValue = card[0];
      gameState.rightValue = card[1];
      gameState.consecutivePasses = 0; // Reset counter pass
      checkWinOrNext(currentPlayer);
      return;
    }

    // Sambung Ujung Kartu (Kiri/Kanan)
    let played = false;
    if (card[0] === gameState.leftValue) {
      gameState.board.unshift([card[1], card[0]]);
      gameState.leftValue = card[1];
      played = true;
    } else if (card[1] === gameState.leftValue) {
      gameState.board.unshift([card[0], card[1]]);
      gameState.leftValue = card[0];
      played = true;
    } else if (card[0] === gameState.rightValue) {
      gameState.board.push([card[0], card[1]]);
      gameState.rightValue = card[1];
      played = true;
    } else if (card[1] === gameState.rightValue) {
      gameState.board.push([card[1], card[0]]);
      gameState.rightValue = card[0];
      played = true;
    }

    if (played) {
      currentPlayer.hand.splice(cardIndex, 1);
      gameState.consecutivePasses = 0; // Reset counter pass jika ada kartu jalan
      checkWinOrNext(currentPlayer);
    } else {
      socket.emit('receive_message', { sender: 'System', text: 'Kartu tidak cocok dengan ujung meja!' });
    }
  });

  function checkWinOrNext(player) {
    if (player.hand.length === 0) {
      let winnerName = player.name;
      
      // Berikan seluruh pot ke pemenang
      player.coins += tablePot;
      let totalWon = tablePot;
      tablePot = 0; // Kosongkan pot setelah dimenangkan

      if (gameMode === 'team') {
        const partner = players.find(p => p.team === player.team && p.id !== player.id);
        winnerName = partner ? `${player.name} & ${partner.name} (Tim ${player.team + 1})` : `${player.name} (Tim ${player.team + 1})`;
        if (partner) partner.coins += totalWon / 2; // Bagi rata ke partner jika tim
      }

      io.emit('game_over', { winner: winnerName, reason: `Kartu di tangan habis! Memenangkan ${totalWon.toLocaleString()} koin dari pot.` });
      gameState.isStarted = false;
      broadcastGameState();
    } else {
      nextTurn();
    }
  }

  // PASS / LEWAT DAN PENANGANAN PEMOTONGAN SALDO KOIN (-100)
  socket.on('pass_turn', () => {
    if (!gameState.isStarted) return;
    const currentPlayer = players[gameState.turnIndex];

    if (currentPlayer && currentPlayer.id === socket.id) {
      if (hasValidMove(currentPlayer.hand, gameState.leftValue, gameState.rightValue)) {
        socket.emit('receive_message', { sender: 'System', text: 'Kamu masih punya kartu yang bisa jalan!' });
        return;
      }

      // Potong koin pemain sebesar 100 koin dan masukkan ke pot meja
      const penalty = 100;
      if (currentPlayer.coins >= penalty) {
        currentPlayer.coins -= penalty;
        tablePot += penalty;
      } else {
        tablePot += currentPlayer.coins;
        currentPlayer.coins = 0; // Jika koin kurang dari denda
      }

      gameState.consecutivePasses++;
      io.emit('receive_message', { sender: 'System', text: `${currentPlayer.name} melewati giliran (PASS) dan didenda 100 koin.` });

      // JIKA SEMUA PEMAIN PASS BERTURUT-TURUT -> GAME BUNTU / GEPUK!
      if (gameState.consecutivePasses >= players.length) {
        handleBlockedGame();
      } else {
        nextTurn();
      }
    }
  });

  // MENENTUKAN PEMENANG SAAT GAME BUNTU / GEPUK
  function handleBlockedGame() {
    let scoresSummary = [];

    if (gameMode === 'team') {
      let teamScores = [0, 0];
      let teamDetails = [[], []];

      players.forEach(p => {
        const score = calculateHandScore(p.hand);
        teamScores[p.team] += score;
        teamDetails[p.team].push(`${p.name} (${score} pt)`);
      });

      scoresSummary.push(`Tim 1: ${teamScores[0]} titik [${teamDetails[0].join(', ')}]`);
      scoresSummary.push(`Tim 2: ${teamScores[1]} titik [${teamDetails[1].join(', ')}]`);

      let winningTeam = teamScores[0] < teamScores[1] ? 0 : 1;
      if (teamScores[0] === teamScores[1]) winningTeam = 0;

      // Bagikan pot ke pemenang tim
      const winningTeamPlayers = players.filter(p => p.team === winningTeam);
      const share = Math.floor(tablePot / winningTeamPlayers.length);
      winningTeamPlayers.forEach(p => p.coins += share);
      
      const wonAmount = tablePot;
      tablePot = 0;

      const members = winningTeamPlayers.map(p => p.name).join(' & ');

      io.emit('game_over', { 
        winner: `Tim ${winningTeam + 1} (${members})`, 
        reason: `Permainan BUNTU! Tim dengan titik terkecil menang (${teamScores[winningTeam]} titik) dan mendapatkan ${wonAmount.toLocaleString()} koin pot. Rincian: [${scoresSummary.join(' | ')}]` 
      });

    } else {
      let minScore = Infinity;
      let winner = null;

      players.forEach(p => {
        const score = calculateHandScore(p.hand);
        scoresSummary.push(`${p.name}: ${score} titik`);
        if (score < minScore) {
          minScore = score;
          winner = p;
        }
      });

      // Berikan pot ke pemain dengan titik terkecil
      if (winner) {
        winner.coins += tablePot;
      }
      const wonAmount = tablePot;
      tablePot = 0;

      const summaryText = scoresSummary.join(', ');
      io.emit('game_over', { 
        winner: winner.name, 
        reason: `Permainan BUNTU! Pemenang titik terkecil: ${winner.name} (${minScore} titik) dan membawa pulang ${wonAmount.toLocaleString()} koin pot. Total titik: [${summaryText}]` 
      });
    }
    
    gameState.isStarted = false;
    broadcastGameState();
  }

  // LIVE CHAT
  socket.on('send_message', (msgText) => {
    if (!msgText || !msgText.trim()) return;
    const player = players.find(p => p.id === socket.id);
    const senderName = player ? player.name : 'Tamu';
    io.emit('receive_message', { sender: senderName, text: msgText.trim() });
  });

  // SINKRONISASI EFEK SUARA EJEKAN / REAKSI PROFIL KE PEMAIN LAIN
  socket.on('play_sound_effect', (soundFile) => {
    socket.broadcast.emit('trigger_sound', soundFile);
  });

  // DISCONNECT
  socket.on('disconnect', () => {
    const p = players.find(pl => pl.id === socket.id);
    if (p) {
      io.emit('receive_message', { sender: 'System', text: `${p.name} keluar dari meja.` });
    }
    players = players.filter(pl => pl.id !== socket.id);
    if (players.length < 2) {
      gameState.isStarted = false;
    } else {
      if (gameState.turnIndex >= players.length) {
        gameState.turnIndex = 0;
      }
    }
    broadcastGameState();
  });

  function nextTurn() {
    gameState.turnIndex = (gameState.turnIndex + 1) % players.length;
    broadcastGameState();
  }

  function broadcastGameState() {
    players.forEach((p) => {
      const isMyTurn = gameState.isStarted && players[gameState.turnIndex] && players[gameState.turnIndex].id === p.id;
      const canPass = isMyTurn && !hasValidMove(p.hand, gameState.leftValue, gameState.rightValue);

      io.to(p.id).emit('update_board', {
        isStarted: gameState.isStarted,
        board: gameState.board,
        myHand: p.hand,
        myCoins: p.coins,         // Mengirimkan koin pemain yang bersangkutan
        tablePot: tablePot,       // Mengirimkan total pot meja
        isMyTurn: isMyTurn,
        canPass: canPass,
        playersSummary: players.map((pl, idx) => ({
          id: pl.id,
          name: pl.name,
          cardCount: pl.hand.length,
          coins: pl.coins,        // Mengirimkan sisa koin untuk slot pemain lain
          isTurn: gameState.isStarted && idx === gameState.turnIndex,
          team: pl.team
        }))
      });
    });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server berjalan di http://localhost:${PORT}`));
