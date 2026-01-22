const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const session = require('express-session');
const MongoStore = require('connect-mongo');
require("dotenv").config();
const multer = require('multer');
const http = require("http")
const { Server } = require("socket.io")
const path = require('path');


const app = express();


app.set("trust proxy", 1);




app.use(cors({
  origin: 'http://localhost:5173', // Zmień na odpowiedni adres frontendu
  credentials: true
}));

app.use(express.json());


app.use(
  session({
    secret: process.env.SESSION_SECRET,
    proxy: true,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_STORAGE,
    }),
    cookie: {
      httpOnly: true,
  secure: true,
  sameSite: "none",
      maxAge: 1000 * 60 * 60 * 24
    }
  })
)




mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log("MongoDB connected"))
  .catch(err => console.log(err));

const userSchema = new mongoose.Schema({
  badge: String,
  nickname: String,
  avatarPicture: String,
  role: String,
});

const User = mongoose.model("Closer0", userSchema);


const onlineUsers = new Map(); 
const server = http.createServer(app)

const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173", // remove trailing slash
    methods: ["GET", "POST"],
    credentials: true
  }
})


io.on("connection", (socket) => {


  socket.on("user-online", (userId) => {
    if (!userId) return;

    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }

    onlineUsers.get(userId).add(socket.id);

    io.emit("online-users", Array.from(onlineUsers.keys()));
  });


   socket.on("sending-message", (data)=> {

    })

  socket.on("disconnect", () => {
    for (const [userId, sockets] of onlineUsers.entries()) {
      if (sockets.has(socket.id)) {
        sockets.delete(socket.id);

        if (sockets.size === 0) {
          onlineUsers.delete(userId);
        }

        break;
      }
    }

    io.emit("online-users", Array.from(onlineUsers.keys()));



   


   
  });
});











app.locals.sharedVar = null;


const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req,file,cb) => {
    const uniqueName = Date.now() + path.extname(file.originalname)
    cb(null, uniqueName)
  }
})
const upload = multer({storage})

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


app.post('/upload', upload.single('file'), (req, res) => {
  const fullUrl = `https://api-server-demo-14.onrender.com/uploads/${req.file.filename}`;
  res.json({ url: fullUrl });
})




app.post("/signin", async (req, res) => {
  try {
    const { badgeInput } = req.body;
    if (!badgeInput) {
      return res.status(400).json({ error: "Brak badgeInput" });
    }

    const user = await User.findOne({ badge: badgeInput });
    if (!user) {
      return res.status(404).json({ error: "Nie znaleziono użytkownika" });
    }

    req.session.userId = user._id;

    req.session.save((err) => {
      if (err) {
        console.error("SESSION SAVE ERROR:", err);
        return res.status(500).json({ error: "Session save failed" });
      }

      res.json({
        message: "Zalogowano pomyślnie",
        user: {
          id: user._id,
          nickname: user.nickname,
          avatarPicture: user.avatarPicture,
          badge: user.badge,
          role: user.role
        }
      });
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Coś poszło nie tak" });
  }
});


app.post("/me/avatar", async (req, res) => {
  const { nowy, nickname } = req.body;

  if (!req.session.userId) {
    return res.status(401).json({ error: "Nie zalogowany" });
  }

  const updateData = {};

  // nickname zawsze może się zmienić
  if (nickname && typeof nickname === "string") {
    updateData.nickname = nickname;
  }

  // avatar tylko jeśli faktycznie został przesłany
  if (nowy && typeof nowy === "string") {
    if (nowy.length < 2) {
      return res.status(400).json({ error: "Avatar za krótki" });
    }
     updateData.avatarPicture = nowy;
  }

  // jeśli nic nie przyszło do update
  if (Object.keys(updateData).length === 0) {
    return res.status(400).json({ error: "Brak danych do aktualizacji" });
  }

  try {
    const updatedUser = await User.findByIdAndUpdate(
      req.session.userId,
      { $set: updateData },
      { new: true }
    );

    res.json({
      message: "Dane zaktualizowane",
      user: updatedUser
    });

  } catch (err) {
    res.status(500).json({ error: "Błąd serwera" });
  }
});





app.get("/me", async (req, res) => {
  if(!req.session.userId){
    return res.status(401).json({loggedIn: false})
  }


  const user = await User.findById(req.session.userId).select("nickname avatarPicture badge role");

  if(!user){
    return res.status(404).json({loggedIn: false})
  }


  res.json({
    loggedIn: true,
    user,

  })
})



const AnnoucmentChatSchema = new mongoose.Schema({

  userNickname: String,
  content: String,
  userAvatar: String,
  imagePicture: String,
  timestamp: { type: Date, default: Date.now },
  
})

const newAnnoucment = mongoose.model("AnnoucmentChat", AnnoucmentChatSchema)



app.post("/sendAnnoucmentMessage", async (req, res) => {
  try {
    const { content, userNickName, userAvatar, myUploadImage } = req.body;

    const savedAnnoucmentMessage = await new newAnnoucment({
      userNickname: userNickName,
      content,
      userAvatar,
      imagePicture: myUploadImage
    }).save();

    
    res.status(200).json({
      message: "Wiadomosc zapisana",
      savedAnnoucmentMessage,
    });

    io.emit("sending-message", savedAnnoucmentMessage)

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Błąd zapisu ogłoszenia" });
  }
});

app.get("/annoucmentMessages", async (req, res)=>{
  try{
    const getAnnoucmentMessages = await newAnnoucment.find({})
    res.status(200).json(getAnnoucmentMessages)
  }catch(error){
    res.status(404).json({message: "cos sie zjebalo"})
  }
})






const messageSchema = new mongoose.Schema({
  avatarPicture: String,
  userNickname: String,
  content: String,
  contentImage: String,
  contentGif: String,
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Closer0' },
  timestamp: { type: Date, default: Date.now },
   replyTo: {
   messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Messages' },
  userNickname: String,
  content: String,
  avatarPicture: String,
  }
});

const newMessage = mongoose.model("Messages", messageSchema)

app.post("/sendMessage", async (req, res) => {
  const { message, myUploadImage, selectedGif, replyTo  } = req.body;

  if (!req.session.userId) return res.status(401).json({ error: "Nie zalogowany" });

  const user = await User.findById(req.session.userId);

  const savedMessage = await new newMessage({
    content: message,
    contentImage: myUploadImage,
    contentGif: selectedGif,
    avatarPicture: user.avatarPicture,
    userNickname: user.nickname,
    userId: user._id,
    mySelectedGif: selectedGif,
     replyTo: replyTo || null
  }).save();

    console.log("fat", savedMessage)

   io.emit("new-message", savedMessage);


  res.status(201).json({ message: "Wiadomość zapisana", savedMessage });
});


const replyMessage = async (req, res) => {
  const { content, replyToMessageId } = req.body;

  if (!req.session.userId) 
    return res.status(401).json({ error: "Nie zalogowany" });

  const user = await User.findById(req.session.userId);
  if (!user) 
    return res.status(404).json({ error: "Użytkownik nie znaleziony" });

  const originalMessage = await newMessage.findById(replyToMessageId)
    .populate("userId", "nickname avatarPicture role");

  if (!originalMessage) 
    return res.status(404).json({ error: "Message not found" });

  const reply = await newMessage.create({
    content,
    userId: user._id,
    userNickname: user.nickname,
    avatarPicture: user.avatarPicture,
    replyTo: {
      messageId: originalMessage._id,
      userNickname: originalMessage.userNickname,
      content: originalMessage.content,
      avatarPicture: originalMessage.avatarPicture
    },
    timestamp: new Date()
  });

  res.json(reply);
};


app.delete("/deleteMessage/:id", async (req, res)=> {

  try{
    const {id} = req.params
    console.log("id do usuniecia: ", id)

    const result = await newMessage.deleteOne({_id: id})
    console.log(result)

    
    if((await result).deletedCount === 0){
      return res.status(404).json({error: "nie znaleziono wiadomosci"})
    }
    
    io.emit("delete-message", id)
    res.json({success: true })

  }catch(err){
    res.status(500).json({error: "blad serwera"})
  }
  

})

app.get("/getMessages", async (req, res) => {
  const messages = await newMessage.find()
    .sort({ timestamp: -1 })
    .populate("userId", "role nickname avatarPicture mySelectedGif _id"); // pobierz rolę nadawcy i inne dane
  res.json(messages);
});


app.get("/getRole", async (req,res)=> {
  const user = await User.find().select("nickname avatarPicture role")


  res.json(user)
})


const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
