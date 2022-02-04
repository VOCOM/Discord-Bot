const Discord = require("discord.js");  //Discord API
const client = new Discord.Client();    //As Client
const YTDL = require("ytdl-core");      //Youtube Download API
const request = require("request");     //Internet Search
const fs = require("fs");               //
const getYoutubeID = require("get-youtube-id"); //Youtube ID API
const fetchVideoInfo = require("youtube-info"); //Youtube Info API

//Load the settings file
var config = JSON.parse(fs.readFileSync('./settings.json', 'utf-8'));
const yt_api_key = config.yt_api_key;
const bot_controller = config.bot_controller;
const prefix = config.prefix;
const discord_token = config.discord_token;

var guilds = {};
var queue = [];
var queueNames = [];
var isPlaying = false;
var inChannel = false;
var dispatcher = null;
var voiceChannel = null;
var skipReq = 0;
var skippers = [];
var disCon;

//Message Arrays
var BadMesg = [/*Error Message Strings*/];
var SignOff = [/*Exit Message Strings*/];
var SignIn = [/*Entry Message Strings*/];
var Emoji = [/*Server Emojis*/];

//Help Menu
var help = new Discord.RichEmbed()
    .setTitle(/*Menu Name*/)
    .setDescription(/*List of Menu Options*/);

//Login into discord
client.login(discord_token);

//Read message
client.on("message", function(message) {
    const member = message.member;
    const mess = message.content.toLowerCase();
    const args = message.content.split(' ').slice(1).join(" ");
    var cmd = message.content.substring(prefix.length).split(" ");

    if (!guilds[message.guild.id]) {
        guilds[message.guild.id] = {
            queue: [],
            queueNames: [],
            isPlaying: false,
            dispatcher: null,
            voiceChannel: null,
            skipReq: 0,
            skippers: [],
            repeat: 0,
            loop: false
        }
    }
  
    //Check for keyword
    if (message.content.startsWith(prefix)) {
        //Check for command
        switch (cmd[0].toLowerCase()) {
            case "game":
                message.author.createDM();
                message.channel.sendEmbed(gameList);
                message.reply("Still in the works");
                break;
            case "play": //Play media
                inChannel = channel_check(message);
                if (inChannel) {
                    if (guilds[message.guild.id].queue.length > 0 || guilds[message.guild.id].isPlaying) {
                        getID(args, function(id) {
                            add_to_queue(id, message);
                            fetchVideoInfo(id, function(err, videoInfo) {
                                if (err) throw new Error(err);
                                message.reply(" added to Queue: **" + videoInfo.title + "**");
                                guilds[message.guild.id].queueNames.push(videoInfo.title);
                            });
                        });
                    } else {
                        guilds[message.guild.id].isPlaying = true;
                        getID(args, function(id) {
                            guilds[message.guild.id].queue.push(id);
                            playMusic(id, message);
                            fetchVideoInfo(id, function(err, videoInfo) {
                                if (err) throw new Error(err);
                                message.reply(" now Playing: **" + videoInfo.title + "**");
                                guilds[message.guild.id].queueNames.push(videoInfo.title);
                            });
                        });
                    }
                }
                break;
            case "skip":  //Skip the current media
                inChannel = channel_check(message);
                if (inChannel) {
                    if (message.author.id != message.guild.ownerID && !message.member.roles.has(bot_controller)) {
                        if (guilds[message.guild.id].skippers.indexOf(message.author.id) === -1) {
                            guilds[message.guild.id].skippers.push(message.author.id);
                            guilds[message.guild.id].skipReq++;
                            if (guilds[message.guild.id].skipReq >= Math.ceil((guilds[message.guild.id].voiceChannel.members.size - 1) / 2)) {
                                skip_song(message);
                                message.reply(" Skipping song.");
                            } else {
                                message.reply(" your need **" + Math.ceil(((guilds[message.guild.id].voiceChannel.members.size - 1) / 2) - guilds[message.guild.id].skipReq) + "** more votes.");
                            }
                        } else {
                            message.reply(" You already voted.");
                        }
                    } else {
                        skip_song(message);
                        message.reply(" Skipping song.");
                    }
                }
                break;
            case "queue": //List the queued media
                var message2 = "";
                for (var i = 0; i < guilds[message.guild.id].queueNames.length; i++) {
                    var temp = (i + 1) + ": " + guilds[message.guild.id].queueNames[i] + (i === 0 ? " **(Current Song)**" : "") +
                        (guilds[message.guild.id].repeat != 0 ? " **(Repeat " + guilds[message.guild.id].repeat + " times)**" : "") +
                        (guilds[message.guild.id].loop ? " **(Loop)**" : "") + "\n";
                    if ((message2 + temp).length <= 2000 - 3) {
                        message2 += temp;
                    } else {
                        message2 += "";
                        message.channel.send(message2);
                        message2 = "";
                    }
                }
                if (message2 == "") {
                    message2 += "**No Songs**";
                }
                message.channel.send(message2);
                break;
            case "stop":  //Stop current media
                stop_song(message);
                break;
            case "repeat":  //Repeat the current media
                repeat(message, cmd[1]);
                break;
            case "loop":  //Sets the current media in a loop
                loop(message);
                break;
            case "help":  //List available commands
                message.channel.sendEmbed(help);
                break;
            case "leave": //Leave the server
                if (guilds[message.guild.id].voiceChannel != null) {
                    guilds[message.guild.id].voiceChannel.connection.disconnect();
                    guilds[message.guild.id].voiceChannel = null;
                    message.channel.sendMessage(SignOff[Math.floor(Math.random() * SignOff.length)]);
                } else {
                    message.reply(/*Error Message*/);
                }
                break;
            case "join":  //Join the voice channel
                guilds[message.guild.id].voiceChannel = message.member.voiceChannel;
                guilds[message.guild.id].voiceChannel.join();
                message.channel.sendMessage(SignIn[Math.floor(Math.random() * SignIn.length)]);
                break;
            default:  //Unkown Command
                message.channel.sendMessage(BadMesg[Math.floor(Math.random() * BadMesg.length)]);
                break;
        }
        client.user.setGame(guilds[message.guild.id].queueNames[0]);
        if (guilds[message.guild.id].voiceChannel != null && !guilds[message.guild.id].isPlaying) {
            clearTimeout(disCon);
            disCon = setTimeout(function() {
                guilds[message.guild.id].voiceChannel.connection.disconnect();
                guilds[message.guild.id].voiceChannel = null;
                message.channel.sendMessage(SignOff[Math.floor(Math.random() * SignOff.length)]);
            }, 60000);
        } else {
            clearTimeout(disCon);
        }
    }
});
//When Client is ready
client.on("ready", function() {
    console.log("I am ready!");
});

//Checks if the messager is in a voice channel
function channel_check(message) {
    var inChannel = false;
    if (!message.member.voiceChannel) {
        message.channel.sendMessage("You must be in a voice channel!");
        inChannel = false;
    } else {
        inChannel = true;
    }
    return inChannel;
}
//Loops the song
function loop(message) {
    if (channel_check(message)) {
        if (guilds[message.guild.id].isPlaying) {
            if (!guilds[message.guild.id].repeat) {
                if (!guilds[message.guild.id].loop) {
                    guilds[message.guild.id].loop = true;
                    message.reply(" Looping **" + guilds[message.guild.id].queueNames[0] + "**");
                } else {
                    guilds[message.guild.id].loop = false;
                    message.reply("Halting loop");
                }
            } else {
                message.reply("So... You want what now? A HyperSphere?");
            }
        } else {
            message.reply("Tell me... how many edges do you think a circle has?");
        }
    }
}
//Repeats the current song
function repeat(message, amount) {
    amount = parseInt(amount);
    if (channel_check(message)) {
        if (guilds[message.guild.id].isPlaying) {
            if (!guilds[message.guild.id].loop) {
                if (!isNaN(amount)) {
                    guilds[message.guild.id].repeat = amount;
                    message.reply(" Repeating **" + guilds[message.guild.id].queueNames[0] + "** " + amount + " times");
                } else {
                    message.reply("To use this intricate command properly, input number of times to repeat after the repeat command, foolish human");
                }
            } else {
                message.reply("Sorry but I can't repeat stupidity...");
            }
        } else {
            message.reply("The repeat of nothing is nothingness...");
        }
    }
}
//Stops the song
function stop_song(message) {
    if (guilds[message.guild.id].dispatcher != null) {
        inChannel = channel_check(message);
        if (inChannel) {
            if (guilds[message.guild.id].isPlaying == true || guilds[message.guild.id].queue.length > 0) {
                message.reply(" Stopping Music.");
                guilds[message.guild.id].isPlaying = false;
                guilds[message.guild.id].repeat = 0;
                guilds[message.guild.id].loop = false;
                guilds[message.guild.id].dispatcher.end();
                guilds[message.guild.id].queue.length = [];
            } else {
                message.reply(" I'm not playing anything...");
            }
        }
    } else {
        message.reply(" I'm not even in the server...");
    }
}
//Skips the songs
function skip_song(message) {
    guilds[message.guild.id].dispatcher.end();
    if (queue.length > 1) {
        playMusic(queue[0], message);
    } else {
        guilds[message.guild.id].skipReq = 0;
        guilds[message.guild.id].skippers = [];
    }
}
//Plays the songs
function playMusic(id, message) {
    guilds[message.guild.id].voiceChannel = message.member.voiceChannel;

    guilds[message.guild.id].voiceChannel.join().then(function(connection) {
        stream = YTDL("https://www.youtube.com/watch?v=" + id, {
            filter: 'audioonly'
        });
        guilds[message.guild.id].skipReq = 0;
        guilds[message.guild.id].skippers = [];

        guilds[message.guild.id].dispatcher = connection.playStream(stream);
        guilds[message.guild.id].dispatcher.on("end", function() {
            guilds[message.guild.id].skipReq = 0;
            guilds[message.guild.id].skippers = [];
            if (guilds[message.guild.id].repeat == 0 && !guilds[message.guild.id].loop) {
                guilds[message.guild.id].queue.shift();
                guilds[message.guild.id].queueNames.shift();
            }
            if (guilds[message.guild.id].repeat > 0) {
                guilds[message.guild.id].repeat--;
            }
            if (!guilds[message.guild.id].queue[0]) {
                guilds[message.guild.id].queue = [];
                guilds[message.guild.id].isPlaying = false;
                disCon = setTimeout(function() {
                    guilds[message.guild.id].voiceChannel.connection.disconnect();
                    guilds[message.guild.id].voiceChannel = null;
                    message.channel.sendMessage(SignOff[Math.floor(Math.random() * SignOff.length)]);
                }, 60000);
            } else {
                setTimeout(function() {
                    playMusic(guilds[message.guild.id].queue[0], message);
                }, 500);
            }
            client.user.setGame(guilds[message.guild.id].queueNames[0]);
        });
    });
}
//Append to the queue
function add_to_queue(strID, message) {
    if (isYoutube(strID)) {
        guilds[message.guild.id].queue.push(getYoutubeID(strID));
    } else {
        guilds[message.guild.id].queue.push(strID);
    }
}
//Gets the youtube video ID
function getID(str, cb) {
    if (isYoutube(str)) {
        cb(getYoutubeID(str));
    } else {
        search_video(str, function(id) {
            cb(id);
        });
    }
}
//Searches for the youtube video on Google
function search_video(query, callback) {
    request("https://www.googleapis.com/youtube/v3/search?part=id&type=video&q=" + encodeURIComponent(query) + "&key=" + yt_api_key, function(error, response, body) {
        var json = JSON.parse(body);
        if (!json.items[0]) callback("3_-a9nVZYjk");
        else {
            callback(json.items[0].id.videoId);
        }
    });
}
//Checks if its a Youtube link
function isYoutube(str) {
    return str.toLowerCase().indexOf("youtube.com") > -1;
}
