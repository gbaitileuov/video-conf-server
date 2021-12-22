const express = require("express");
const app = express();
const http = require("http").createServer(app);
const cors = require("cors");
const axios = require("axios");

const io = require("socket.io")(http, {
  maxHttpBufferSize: 1e20,
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(cors());

const PORT = process.env.PORT || 3001;

app.get("/", (_, res) => {
  res
    .send({
      success: true,
    })
    .status(200);
});

const getDateTime = () => {
  var now = new Date();
  var year = now.getFullYear();
  var month = now.getMonth() + 1;
  var day = now.getDate();
  var hour = now.getHours();
  var minute = now.getMinutes();
  var second = now.getSeconds();
  if (month.toString().length == 1) {
    month = "0" + month;
  }
  if (day.toString().length == 1) {
    day = "0" + day;
  }
  if (hour.toString().length == 1) {
    hour = "0" + hour;
  }
  if (minute.toString().length == 1) {
    minute = "0" + minute;
  }
  if (second.toString().length == 1) {
    second = "0" + second;
  }
  var dateTime = day + "." + month + "." + year + " " + hour + ":" + minute + ":" + second;
  return dateTime;
};

let socketList = {};

// Socket
io.on("connection", (socket) => {
  // console.log(`New User connected: ${socket.id}`);

  socket.on("disconnect", () => {
    // console.log("disconnect called");
    socket.broadcast.emit("FE-user-leave", { userId: socket.id });
    if (socketList[socket.id] && socketList[socket.id].roomId) {
      const roomId = socketList[socket.id].roomId;
      socket.leave(roomId);

      let count = 0;
      const users = io.sockets.adapter.rooms.get(roomId);

      if (users) {
        count = users.size;
      }

      if (count === 0) {
        axios
          .post("https://tmedback.herokuapp.com/api/status-update/" + roomId + "/", {
            status: "Обработано",
          })
          .then((response) => {
            axios
              .post("https://tmedback.herokuapp.com/api/create-chat/", {
                link: roomId,
                enddate: getDateTime(),
              })
              .catch((e) => {
                console.error(e);
              });
          })
          .catch((e) => {
            console.error(e);
            axios
              .post("https://tmedback.herokuapp.com/api/create-chat/", {
                link: roomId,
                enddate: e,
              })
              .catch((e) => {
                console.error(e);
              });
          });
      }
    }

    delete socketList[socket.id];
    socket.disconnect();
  });

  /**
   * Join Room
   */
  socket.on("BE-join-room", ({ roomId, userId, userName, userRole, userVideo, userAudio }) => {
    // Socket Join RoomId
    socket.join(roomId);
    socketList[socket.id] = { roomId, userId, userName, userRole, userVideo, userAudio };

    // Set User List
    const users = [];
    io.sockets.adapter.rooms.get(roomId).forEach((client) => {
      // Add User List
      users.push({ userId: client, info: socketList[client] });
    });
    // console.log("users:", users);

    if (users.length > 2) {
      io.to(socket.id).emit("FE-allow-status", { allow: false });
      return;
    }
    socket.broadcast.to(roomId).emit("FE-user-join", users);
  });

  socket.on("BE-allow-join-room", ({ roomId, userId }) => {
    const users = io.sockets.adapter.rooms.get(roomId);

    if (!users) {
      io.to(userId).emit("FE-allow-status", { allow: true });
      return;
    }

    // console.log("users:", users, users.length, users.size);

    io.to(userId).emit("FE-allow-status", { allow: users.size < 2 ? true : false });
  });

  socket.on("BE-call-user", ({ userToCall, from, signal }) => {
    io.to(userToCall).emit("FE-receive-call", {
      signal,
      from,
      info: socketList[socket.id],
    });
  });

  socket.on("BE-accept-call", ({ roomId, signal, to }) => {
    io.to(to).emit("FE-call-accepted", {
      signal,
      answerId: socket.id,
    });

    axios
      .post("https://tmedback.herokuapp.com/api/create-chat/", {
        link: roomId,
        startdate: getDateTime(),
      })
      .catch((e) => {
        console.error(e);
      });
  });

  socket.on("BE-send-message", async ({ roomId, data }) => {
    await io.sockets.in(roomId).emit("FE-receive-message", { data });
  });

  // socket.on("BE-leave-room", ({ roomId }) => {
  //   if (socketList[socket.id]) {
  //     console.log("BE-leave-room called");
  //     delete socketList[socket.id];
  //     socket.broadcast.to(roomId).emit("FE-user-leave", { userId: socket.id });
  //     socket.leave(roomId);
  //   }
  // });

  socket.on("BE-toggle-camera-audio", ({ roomId, switchTarget, state }) => {
    if (switchTarget === "video") {
      socketList[socket.id].video = state;
    } else {
      socketList[socket.id].audio = state;
    }
    socket.broadcast.to(roomId).emit("FE-toggle-camera", { userId: socket.id, switchTarget, state });
  });
});

http.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
