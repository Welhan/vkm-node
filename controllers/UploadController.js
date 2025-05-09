const express = require("express");
const helpers = require("../helpers/helpers");
const dotenv = require("dotenv");
const reader = require("xlsx");
const xlsx = require("xlsx");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const { db } = require("../configs/db");
const startTime = Date.now();
const loyalty = ["Bronze", "Silver", "Gold", "Platinum", "Diamond"];
const games = ["Slot", "Casino"];
const { Worker } = require("worker_threads");
const { constants } = require("../configs/constants");
dotenv.config();
function formatDate(date, dateTime = true, delimiter = true) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  if (dateTime) {
    if (delimiter) {
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    } else {
      return `${year}${month}${day}${hours}${minutes}${seconds}`;
    }
  } else {
    return `${year}-${month}-${day}`;
  }
}
let errMsg = [];
let errMinus = [];
let TotalTop50 = 0;
let TotalGame = 0;
async function updatePlacement() {
  let queryStartDate = `SELECT * FROM systab WHERE Config = 'StartDate' AND WebsiteID = '${process.env.websiteID}'`;
  let startDate = (await helpers.doQuery(db, queryStartDate)).results;
  let start =
    startDate.length > 0
      ? startDate[0].Value
        ? String(startDate[0].Value).padStart(2, "0")
        : "02"
      : "02";
  const today = new Date();
  const day = today.getDate();
  let dateCondition = "";
  let end = String(parseInt(start) - 1).padStart(2, "0");
  if (day <= parseInt(start) - 1) {
    dateCondition = `Date >= DATE_FORMAT(NOW() - INTERVAL 1 MONTH, '%Y-%m-${start}') AND Date <= DATE_FORMAT(NOW(), '%Y-%m-${end}') `;
  } else {
    dateCondition = `Date BETWEEN DATE_FORMAT(CURRENT_DATE(), '%Y-%m-${start}') AND DATE_FORMAT(DATE_ADD(NOW(), INTERVAL 1 MONTH), '%Y-%m-${end}')`;
  }
  // SELECT ID, CASE WHEN Turnover IS NULL OR Turnover = 0 THEN 0 ELSE ROW_NUMBER() OVER(ORDER BY Turnover DESC, Username ASC) END AS Placement, CurrentPlacement, LastPlacement FROM top_league WHERE Date BETWEEN DATE_FORMAT(CURRENT_DATE(), '%Y-%m-10') AND DATE_FORMAT(DATE_ADD(NOW(), INTERVAL 1 MONTH), '%Y-%m-15') AND League = 'Bronze' AND WebsiteID = 7;

  async function bulkUpdateTopLeague(classmentResult) {
    const batchSize = 5; // Tentukan ukuran batch
    for (let i = 0; i < classmentResult.length; i += batchSize) {
      const batch = classmentResult.slice(i, i + batchSize); // Ambil batch

      const ids = batch.map((item) => item.ID).join(",");
      const currentPlacementCases = batch
        .map((item) => `WHEN ${item.ID} THEN ${item.Placement}`)
        .join(" ");

      const lastPlacementCases = batch
        .map((item) => `WHEN ${item.ID} THEN ${item.CurrentPlacement}`)
        .join(" ");

      const updateSql = `
        UPDATE top_league
        SET
          CurrentPlacement = CASE ID ${currentPlacementCases} END,
          LastPlacement = CASE ID ${lastPlacementCases} END,
          Last_Date = NOW()
        WHERE ID IN (${ids});
      `;

      try {
        await new Promise((resolve, reject) => {
          db.query(updateSql, function (err) {
            if (err) {
              console.error("Bulk update failed for top_league:", err);
              return reject(err);
            }
            resolve();
          });
        });
      } catch (error) {
        console.error("Error during bulk update for top_league:", error);
      }
    }
  }
  async function bulkUpdateTopGamer(classmentGame) {
    const batchSize = 5; // Tentukan ukuran batch
    for (let i = 0; i < classmentGame.length; i += batchSize) {
      const batch = classmentGame.slice(i, i + batchSize); // Ambil batch

      const ids = batch.map((item) => item.ID).join(",");
      const currentPlacementCases = batch
        .map(
          (item) =>
            `WHEN ${item.ID} THEN ${item.Placement != "" ? item.Placement : 0}`
        )
        .join(" ");
      const lastPlacementCases = batch
        .map(
          (item) =>
            `WHEN ${item.ID} THEN ${
              item.CurrentPlacement ? item.CurrentPlacement : 0
            }`
        )
        .join(" ");

      const updateSql = `
        UPDATE top_gamer
        SET
          CurrentPlacement = CASE ID ${currentPlacementCases} END,
          LastPlacement = CASE ID ${lastPlacementCases} END,
          Last_Date = NOW()
        WHERE ID IN (${ids});
      `;

      try {
        await new Promise((resolve, reject) => {
          db.query(updateSql, function (err) {
            if (err) {
              console.error("Bulk update failed for top_gamer:", err);
              return reject(err);
            }
            resolve();
          });
        });
      } catch (error) {
        console.error("Error during bulk update for top_gamer:", error);
      }
    }
  }

  return new Promise(async (resolve, reject) => {
    try {
      let classmentTop50 = [];
      let classmentGame = [];
      await Promise.all(
        loyalty.map(async (el) => {
          const sql = `
            SELECT ID, 
                   CASE WHEN Turnover IS NULL OR Turnover = 0 THEN 0 ELSE ROW_NUMBER() OVER(ORDER BY Turnover DESC, Username ASC) END AS Placement, 
                   CurrentPlacement, 
                   LastPlacement
            FROM top_league
            WHERE ${dateCondition} AND League = ? AND WebsiteID = ?`;
          let results = (
            await helpers.doQuery(db, sql, [el, process.env.websiteID])
          ).results;
          classmentTop50.push(...results);
        })
      );
      await Promise.all(
        games.map(async (game) => {
          const sql = `
            SELECT ID, 
                   CASE WHEN Turnover IS NULL OR Turnover = '' THEN 0 ELSE ROW_NUMBER() OVER(ORDER BY Turnover DESC, Username ASC) END AS Placement, 
                   CurrentPlacement, 
                   LastPlacement
            FROM top_gamer
            WHERE ${dateCondition} AND Game_Category = ? AND WebsiteID = ?`;
          let results = (
            await helpers.doQuery(db, sql, [game, process.env.websiteID])
          ).results;
          classmentGame.push(...results);
        })
      );
      if (classmentTop50.length > 0) {
        await bulkUpdateTopLeague(classmentTop50);
      }
      if (classmentGame.length > 0) {
        await bulkUpdateTopGamer(classmentGame);
      }
      let response = await setTopPlayerWinner();
      resolve({
        statusMessage: response.statusMessage,
        message: response.message,
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function setTopPlayerWinner() {
  let queryStartDate = `SELECT * FROM systab WHERE Config = 'StartDate' AND WebsiteID = '${process.env.websiteID}'`;
  let startDate = (await helpers.doQuery(db, queryStartDate)).results;
  let start =
    startDate.length > 0
      ? startDate[0].Value
        ? String(startDate[0].Value).padStart(2, "0")
        : "02"
      : "02";
  const today = new Date();
  const day = today.getDate();
  let end = String(parseInt(start) - 1).padStart(2, "0");
  let dateCondition = "";
  if (day <= parseInt(start) - 1) {
    dateCondition = `Date >= DATE_FORMAT(NOW() - INTERVAL 1 MONTH, '%Y-%m-${start}') AND Date <= DATE_FORMAT(NOW(), '%Y-%m-${end}')`;
    for (let el of loyalty) {
      let sql = `SELECT * 
                    FROM top_league 
                    WHERE League = '${el}' 
                    AND ${dateCondition}
                    ORDER BY Turnover DESC, Username ASC 
                    LIMIT 50;`;
      let players = (await helpers.doQuery(db, sql)).results;
      let queryPercentage = `SELECT Persentase, Urutan FROM mst_persentase_hadiah_leaderboard WHERE Category = 'Top Player' ORDER BY Urutan ASC`;
      let getPersentaseHadiah = (await helpers.doQuery(db, queryPercentage))
        .results;
      let queryHadiah = `SELECT * FROM mst_hadiah_leaderboard WHERE Tier = '${el}'`;
      let getHadiah = (await helpers.doQuery(db, queryHadiah)).results;
      let Hadiah = new Array();
      let percentage = 100;
      getPersentaseHadiah.forEach((el, index) => {
        percentage -= getPersentaseHadiah[index].Persentase;
        Hadiah.push({
          Hadiah:
            (parseFloat(getPersentaseHadiah[index].Persentase) *
              parseFloat(getHadiah[0].TotalHadiah)) /
            100,
        });
        if (index == 9) {
          let sisaPercentage = percentage / 40;
          for (let i = 9; i < 49; i++) {
            let hadiah =
              (parseFloat(sisaPercentage) *
                parseFloat(getHadiah[0].TotalHadiah)) /
              100;
            Hadiah.push({
              Hadiah: hadiah,
            });
          }
        }
      });
      let Rank = 1;
      async function processPlayers(players, dateCondition, Hadiah, Rank) {
        // Ambil semua data leaderboard_winner sekaligus
        dateCondition = `DATE_FORMAT(CDate, '%Y-%m-%d') >= DATE_FORMAT(NOW() - INTERVAL 1 MONTH, '%Y-%m-${start}') AND DATE_FORMAT(CDate, '%Y-%m-%d') <= DATE_FORMAT(NOW(), '%Y-%m-${end}')`;
        const existingPlayersQuery = `
          SELECT * FROM leaderboard_winner 
          WHERE WebsiteID = ${process.env.websiteID} 
          AND Category = 'Top Player' 
          AND ${dateCondition}`;
        const existingPlayers = (
          await helpers.doQuery(db, existingPlayersQuery)
        ).results;

        // Buat map untuk mempermudah pencarian
        const existingPlayersMap = new Map(
          existingPlayers.map((player) => [`${player.Username}`, player])
        );

        // Array untuk batch INSERT dan UPDATE
        const insertData = [];
        const updateData = [];

        for (let i = 0; i < players.length; i++) {
          const player = players[i];
          const existingPlayer = existingPlayersMap.get(player.Username);

          if (existingPlayer) {
            // Jika pemain sudah ada dan prosesnya "Approved" atau "Rejected", lewati
            if (
              existingPlayer.Process === "Approved" ||
              existingPlayer.Process === "Rejected"
            ) {
              continue;
            }

            // Jika pemain sudah ada, tambahkan ke batch UPDATE
            updateData.push({
              ID: existingPlayer.ID,
              Rank,
            });
          } else {
            // Jika pemain belum ada, tambahkan ke batch INSERT
            const prize = Hadiah[i]?.Hadiah || 0;
            const processStatus = player.FakeAcc === 1 ? "Approved" : "Waiting";

            insertData.push([
              player.FakeAcc,
              "Top Player",
              player.Turnover,
              process.env.websiteID,
              Rank,
              player.League,
              player.Username,
              prize,
              processStatus,
              new Date(),
              new Date(),
            ]);
          }

          Rank += 1;
        }

        // Batch UPDATE
        if (updateData.length > 0) {
          const updateQueries = updateData.map(
            (data) =>
              `UPDATE leaderboard_winner SET Rank = ${data.Rank} WHERE ID = ${data.ID};`
          );
          await helpers.doQuery(db, updateQueries.join(" "));
        }

        // Batch INSERT
        if (insertData.length > 0) {
          const insertQuery = `
            INSERT INTO leaderboard_winner 
            (FakeAcc, Category, Turnover, WebsiteID, Rank, Loyalty, Username, Prize, Process, CDate, Last_Date) 
            VALUES ?`;
          await helpers.doQuery(db, insertQuery, [insertData]);
        }
      }
      await processPlayers(players, dateCondition, Hadiah, Rank);
      // for (let i = 0; i < players.length; i++) {
      //   let checkPlayerQuery = `SELECT * FROM leaderboard_winner
      //   WHERE WebsiteID = ${process.env.websiteID}
      //   AND Category = 'Top Player'
      //   AND Username = '${players[i].Username}'
      //   AND ${dateCondition}`;
      //   let checkPlayer = (await helpers.doQuery(db, checkPlayerQuery)).results;
      //   if (checkPlayer.length > 0) {
      //     if (
      //       checkPlayer[0]["Process"] == "Approved" ||
      //       checkPlayer[0]["Process"] == "Rejected"
      //     ) {
      //       continue;
      //     } else {
      //       db.query(
      //         `UPDATE leaderboard_winner SET
      //         Category = 'Top Player',
      //         Rank = '${Rank}'
      //         WHERE ID = ${checkPlayer[0]["ID"]}`,
      //         function (err) {
      //           if (err) {
      //             console.error(err);
      //           }
      //         }
      //       );
      //     }
      //   } else {
      //     if (players[i].FakeAcc == 1) {
      //       db.query(
      //         `INSERT INTO leaderboard_winner (FakeAcc, Category, Turnover, WebsiteID, Rank, Loyalty, Username, Prize, Process, CDate, Last_Date)
      //         VALUES (${players[i].FakeAcc}, 'Top Player', ${players[i].Turnover},${process.env.websiteID}, '${Rank}','${players[i].League}','${players[i].Username}','${Hadiah[i].Hadiah}','Approved', NOW(), NOW())`,
      //         function (err) {
      //           if (err) {
      //             console.error(err);
      //           }
      //         }
      //       );
      //     } else {
      //       db.query(
      //         `INSERT INTO leaderboard_winner (FakeAcc, Category, Turnover, WebsiteID, Rank, Loyalty, Username, Prize, Process, CDate)
      //         VALUES (${players[i].FakeAcc}, 'Top Player', ${players[i].Turnover
      //         },${process.env.websiteID}, '${Rank}','${players[i].League}','${players[i].Username
      //         }','${Hadiah[i].Hadiah}','Waiting', '${formatDate(new Date())}')`,
      //         function (err) {
      //           if (err) {
      //             console.error(err);
      //           }
      //         }
      //       );
      //     }
      //   }
      //   Rank += 1;
      // }
    }
    for (let el of games) {
      let sql = `SELECT * FROM top_gamer WHERE Game_Category = '${el}' AND Date >= DATE_FORMAT(NOW() - INTERVAL 1 MONTH, '%Y-%m-${start}') AND Date <= DATE_FORMAT(NOW(), '%Y-%m-${end}') ORDER BY Turnover DESC LIMIT 50`;
      let players = (await helpers.doQuery(db, sql)).results;
      let queryPercentage = `SELECT Percentage FROM mst_game_bonus WHERE Category = '${el}'`;
      let getPersentaseHadiah = (await helpers.doQuery(db, queryPercentage))
        .results;
      for (let [index, player] of players.entries()) {
        let checkPlayerQuery = `SELECT * FROM leaderboard_winner WHERE WebsiteID = ${process.env.websiteID} AND Game_Category = '${el}' AND Username = '${player.Username}' AND DATE_FORMAT(CDate, '%Y-%m-%d') >= DATE_FORMAT(NOW() - INTERVAL 1 MONTH, '%Y-%m-${start}') AND DATE_FORMAT(CDate, '%Y-%m-%d') <= DATE_FORMAT(NOW(), '%Y-%m-${end}') `;

        let checkPlayer = (await helpers.doQuery(db, checkPlayerQuery)).results;

        if (checkPlayer.length > 0) {
          if (
            checkPlayer[0]["Process"] == "Approved" ||
            checkPlayer[0]["Process"] == "Rejected"
          ) {
            continue;
          } else {
            db.query(
              `UPDATE leaderboard_winner SET Game_Category = '${el}', Rank = '${player.CurrentPlacement}' WHERE ID = ${checkPlayer[0]["ID"]}`,
              function (err) {
                if (err) {
                  console.error(err);
                }
              }
            );
          }
        } else {
          if (player.FakeAcc == 0) {
            db.query(
              `INSERT INTO leaderboard_winner (FakeAcc, Category, Turnover, Game_Category, WebsiteID, Rank, Username,Prize,Process,CDate) 
                    VALUES (${player.FakeAcc},'Top Game',${
                player.Turnover
              },'${el}', ${process.env.websiteID}, '${
                player.CurrentPlacement
              }','${player.Username}','${
                getPersentaseHadiah[0].Percentage
              }','Approved', '${formatDate(new Date())}')`,
              function (err) {
                if (err) {
                  console.error(err);
                }
              }
            );
          } else {
            db.query(
              `INSERT INTO leaderboard_winner (FakeAcc, Category, Turnover, Game_Category, WebsiteID, Rank, Username,Prize,Process,CDate, Last_Date) 
                    VALUES (${player.FakeAcc},'Top Game',${player.Turnover},'${el}', ${process.env.websiteID}, '${player.CurrentPlacement}','${player.Username}','${getPersentaseHadiah[0].Percentage}','Approved', NOW(),NOW())`,
              function (err) {
                if (err) {
                  console.error(err);
                }
              }
            );
          }
        }
      }
    }
    helpers.log_update("success", "End Set Top Player Winner");
    let queryPlayerWD = `SELECT Username, CurrentPlacement, Withdraw AS Turnover FROM top_withdraw WHERE MONTH(NOW() - INTERVAL 1 MONTH) = MONTH(Date) AND YEAR(NOW() - INTERVAL 1 MONTH) = YEAR(Date) ORDER BY CurrentPlacement, Username ASC LIMIT 50`;
    let dataPlayer = (await helpers.doQuery(db, queryPlayerWD)).results;
    let queryPercentage = `SELECT Persentase, Urutan FROM mst_persentase_hadiah_leaderboard WHERE Category = 'Withdraw' ORDER BY Urutan ASC`;
    let getPersentaseHadiah = (await helpers.doQuery(db, queryPercentage))
      .results;
    let Percentage = new Array();
    getPersentaseHadiah.forEach((el, index) => {
      Percentage.push({
        Hadiah: getPersentaseHadiah[index].Persentase,
      });
    });
    let lastPercentage = Percentage[10].Hadiah;
    if (Percentage.length > 10) {
      Percentage.splice(10, 1);
    }
    for (let i = 10; i < dataPlayer.length; i++) {
      Percentage.push({
        Hadiah: lastPercentage,
      });
    }
    for (let i = 0; i < dataPlayer.length; i++) {
      // hit API kalau terdaftar di leads baru masuk ke leaderboard_winner dan approved, kalau tidak terdaftar reject (tunggu kepastian)
      let checkPlayerQuery = `SELECT * FROM leaderboard_winner 
      WHERE WebsiteID = ${process.env.websiteID} 
      AND Category = 'Top Withdraw' 
      AND Username = '${dataPlayer[i].Username}'
      AND MONTH(CDate) = MONTH(NOW()) 
      AND YEAR(NOW()) = YEAR(CDate)`;

      let checkPlayer = (await helpers.doQuery(db, checkPlayerQuery)).results;

      if (checkPlayer.length > 0) {
        if (checkPlayer[0]["Process"] == "Approved") {
          continue;
        } else {
          db.query(
            `UPDATE leaderboard_winner SET Category = 'Top Withdraw', Rank = '${dataPlayer[i].CurrentPlacement}' WHERE ID = ${checkPlayer[0]["ID"]}`,
            function (err) {
              if (err) {
                console.error(err);
              }
            }
          );
        }
      } else {
        db.query(
          `INSERT INTO leaderboard_winner (
          Category, 
          Turnover,
          WebsiteID, 
          Rank, 
          Username,
          Prize,
          Process,
          CDate, Last_Date
          ) VALUES (
          'Top Withdraw', 
          ${dataPlayer[i].Turnover},
          ${process.env.websiteID}, 
          '${dataPlayer[i].CurrentPlacement}',
          '${dataPlayer[i].Username}',
          ${parseFloat(Percentage[i].Hadiah)},
          'Approved', 
          NOW(), NOW())`,
          function (err) {
            if (err) {
              console.error(err);
            }
          }
        );
      }
    }
    return {
      statusMessage: true,
      message: `Set Top Player Winner selesai diupdate`,
    };
  } else {
    return {
      statusMessage: true,
      message: `Tidak ada data yang harus diupdate`,
    };
  }
}

async function withdrawWinner() {
  let queryStartDate = `SELECT * FROM systab WHERE Config = 'StartDate' AND WebsiteID = '${process.env.websiteID}'`;
  let startDate = (await helpers.doQuery(db, queryStartDate)).results;
  let start =
    startDate.length > 0 ? (startDate[0].Value ? startDate[0].Value : 2) : 2;
  const today = new Date();
  const day = today.getDate();
  if (day == parseInt(start) - 1) {
    helpers.log_update("success", "Start Set Top Player Withdraw");

    helpers.log_update("success", "Start Set Top Player Withdraw");
    return {
      statusMessage: true,
      message: `Set Top Withdraw Winner selesai diupdate`,
    };
  } else {
    return {
      statusMessage: true,
      message: `Tidak ada Top Withdraw Winner yang diupdate`,
    };
  }
}

module.exports = {
  index: async function (req, res) {
    let Username = req.session.Username;
    if (!Username) return res.redirect("/login");
    let akses = await helpers.checkUserAccess(Username, 3, 5);
    if (!akses) return res.redirect("/");
    let menu = await helpers.generateMenu(Username);
    menu = await Promise.all(
      menu.map(async (item) => {
        item.submenu = await helpers.generateSubmenu(item.ID, Username);
        return item;
      })
    );
    let bracketLink = (
      await helpers.doQuery(
        db,
        `SELECT * FROM config WHERE Config = 'Bracket URL'`
      )
    ).results;

    return res.render("uploads/upload-leaderboard", {
      successMessage: req.flash("success"),
      errorMessage: req.flash("error"),
      session: req.session,
      menu,
      csrfToken: req.csrfToken(),
      open: 3,
      active: 5,
      bracket: bracketLink[0].Value ? true : false,
      constants,
    });
  },
  uploadXslxLeadsProcess: async function (req, res) {
    TotalTop50 = 0;
    TotalGame = 0;
    errMsg = new Array();
    let Username = req.session.Username;
    if (!Username) return res.redirect("/login");
    let file = reader.readFile("./public/uploads/xlsx/" + req.file.filename);
    let fileData = "./public/uploads/xlsx/" + req.file.filename;
    await new Promise((resolve, reject) => {
      try {
        let errTemplate = new Array();
        let errTop50 = false;
        let errGame = false;
        let errWithdraw = false;
        let TotalData = 0;
        file.SheetNames.forEach(async (sheetName) => {
          if (sheetName == "Top 50") {
            let sheetData = reader.utils.sheet_to_json(file.Sheets[sheetName]);
            let headers = Object.keys(sheetData[0]);
            if (headers.length >= 4) {
              if (
                headers[0] !== "Player" ||
                headers[1] !== "Loyalty" ||
                headers[2] !== "Turnover" ||
                headers[3] !== "Fake Account"
              ) {
                errTop50 = true;
                let error = {
                  error: `Template Leaderboard Top50 Tidak Sesuai`,
                };
                errTemplate.push(error);
              } else {
                TotalTop50 = sheetData.length;
                TotalData += sheetData.length;
              }
            } else {
              errTop50 = true;
              let error = { error: `Template Leaderboard Top50 Tidak Sesuai` };
              errTemplate.push(error);
            }
          } else if (sheetName == "Game") {
            let sheetData = reader.utils.sheet_to_json(file.Sheets[sheetName]);
            let headers = Object.keys(sheetData[0]);
            if (headers.length >= 4) {
              if (
                headers[0] != "Player" ||
                headers[1] != "Slot" ||
                headers[2] != "Casino" ||
                headers[3] != "Fake Account"
              ) {
                errGame = true;
                let error = { error: `Template Leaderboard Game Tidak Sesuai` };
                errTemplate.push(error);
              } else {
                TotalGame = sheetData.length * 2;
                TotalData += sheetData.length * 2;
              }
            } else {
              errGame = true;
              let error = { error: `Template Leaderboard Game Tidak Sesuai` };
              errTemplate.push(error);
            }
          } else if (sheetName == "Withdraw") {
            let sheetData = reader.utils.sheet_to_json(file.Sheets[sheetName]);
            let headers = Object.keys(sheetData[0]);
            if (headers.length >= 4) {
              if (headers[0] != "Player" || headers[1] != "Turnover") {
                errWithdraw = true;
                let error = {
                  error: `Template Leaderboard Withdraw Tidak Sesuai`,
                };
                errTemplate.push(error);
              } else {
                TotalWithdraw = sheetData.length;
                TotalData += sheetData.length;
              }
            } else {
              errWithdraw = true;
              let error = {
                error: `Template Leaderboard Withdraw Tidak Sesuai`,
              };
              errTemplate.push(error);
            }
          }
        });
        if (errTemplate.length == 2) {
          req.flash(
            "error",
            "Template Leaderboard Top50 dan Game tidak sesuai"
          );
          return res.redirect("/upload-leaderboard");
        } else if (errTop50) {
          req.flash("error", "Template Leaderboard Top50 tidak sesuai");
          return res.redirect("/upload-leaderboard");
        } else if (errGame) {
          req.flash("error", "Template Leaderboard Game tidak sesuai");
          return res.redirect("/upload-leaderboard");
        } else if (errWithdraw) {
          req.flash("error", "Template Leaderboard Withdraw tidak sesuai");
          return res.redirect("/upload-leaderboard");
        } else {
          console.log("Total Data: ", TotalData);
          req.session.FileName = req.file.originalname;
          db.query(
            `INSERT INTO files (UploadFor, TotalData, CUserID, CDate) VALUE (?, ?, ?, NOW())`,
            ["Leaderboard", TotalData, req.session.ID],
            async function (err, results) {
              if (err) {
                req.flash("error", "Upload XLSX gagal!");
                return res.redirect("/upload-leaderboard");
              }
              req.session.FileID = results.insertId;
              req.flash("success", "Uploading...");
              res.redirect("/upload-leaderboard");
              const worker = new Worker(
                path.resolve(__dirname, "worker/worker-upload.js"),
                {
                  workerData: {
                    file,
                    FileID: req.session.FileID,
                  },
                }
              );

              worker.on("message", (result) => {
                if (result.minus == true) {
                  errMinus.push({
                    row: result.row,
                    player: result.player,
                    message: result.message,
                  });
                } else {
                  errMsg.push({
                    row: result.row,
                    player: result.player,
                    message: result.message,
                  });
                }
              });

              worker.on("error", (err) => {
                console.log(err);
              });

              worker.on("exit", (code) => {
                if (code !== 0) {
                  console.error(`Worker stopped with exit code ${code}`);
                }
              });
              resolve();
            }
          );
        }
      } catch (error) {
        reject(error);
      }
    });
    fs.unlink(fileData, (err) => {});
  },
  getUploadLeadsProcess: async function (req, res) {
    if (!req.session.ID) {
      return res.redirect("/login");
    }
    let FileID = req.session.FileID ? req.session.FileID : null;
    let updatePlacementProcess = req.session.updatePlacementProcess
      ? req.session.updatePlacementProcess
      : null;
    if (FileID) {
      let totalDataResult = (
        await helpers.doQuery(
          db,
          `SELECT TotalData, TotalNotFound, NotFoundTop50, NotFoundGame, NotFoundWD FROM files WHERE ID = ?`,
          [FileID]
        )
      ).results;
      let totalData = totalDataResult[0].TotalData;
      let totalDataNotFound = totalDataResult[0]["TotalNotFound"];
      let NotFoundTop50 = totalDataResult[0]["NotFoundTop50"];
      let NotFoundGame = totalDataResult[0]["NotFoundGame"];
      let NotFoundWD = totalDataResult[0]["NotFoundWD"];
      let totalDataTop50 = TotalTop50;
      let totalDataGame = TotalGame;
      let totalDataWD = TotalWD;
      let uploadProcessTop50 = (
        await helpers.doQuery(
          db,
          `SELECT COUNT(ID) AS uploadProcess FROM top_league WHERE FileID = ?`,
          [FileID]
        )
      ).results[0].uploadProcess;
      let uploadProcessGame = (
        await helpers.doQuery(
          db,
          `SELECT COUNT(ID) AS uploadProcess FROM top_gamer WHERE FileID = ?`,
          [FileID]
        )
      ).results[0].uploadProcess;
      let uploadProcessWD = (
        await helpers.doQuery(
          db,
          `SELECT COUNT(ID) AS uploadProcess FROM top_withdraw WHERE FileID = ?`,
          [FileID]
        )
      ).results[0].uploadProcess;
      let finishTop50 = false;
      let finishGame = false;
      let finishWD = false;
      let calculating = false;
      let finishAll = false;
      // tanda-tanda
      let TotalDataBersihTop50 = totalDataTop50 - NotFoundTop50;
      let TotalDataBersihGame = totalDataGame - NotFoundGame;
      let TotalDataBersihWD = totalDataWD - NotFoundWD;
      let validasiTop50 = totalDataTop50 - NotFoundTop50;
      let validasiGame = totalDataGame - NotFoundGame;
      let validasiWD = totalDataWD - NotFoundWD;
      if (
        uploadProcessTop50 == TotalDataBersihTop50 ||
        TotalDataBersihTop50 == 0 ||
        uploadProcessTop50 == totalDataTop50
      ) {
        if (validasiTop50 == TotalDataBersihTop50) {
          finishTop50 = true;
        } else {
          finishTop50 = true;
        }
      }
      if (finishTop50) {
        if (
          uploadProcessGame == TotalDataBersihGame ||
          TotalDataBersihGame == 0 ||
          uploadProcessGame == totalDataGame
        ) {
          finishGame = true;
          // calculating = true;
        } else if (
          validasiGame == TotalDataBersihGame &&
          uploadProcessGame > TotalDataBersihGame
        ) {
          finishGame = true;
          // calculating = true;
        }
      }

      if (finishWD) {
        if (
          uploadProcessWD == TotalDataBersihWD ||
          TotalDataBersihWD == 0 ||
          uploadProcessWD == totalDataWD
        ) {
          finishWD = true;
          calculating = true;
        } else if (
          validasiWD == TotalDataBersihWD &&
          uploadProcessWD > TotalDataBersihWD
        ) {
          finishWD = true;
          calculating = true;
        }
      }
      let uploadProcess = uploadProcessTop50 + uploadProcessGame;
      let percentage = parseFloat(
        (uploadProcess + totalDataNotFound) / totalData
      );
      if (updatePlacementProcess !== null) {
        await updatePlacement();
        req.session.FileID = null;
        req.session.FileName = null;
        req.session.updatePlacementProcess = null;
        finishAll = true;
        TotalTop50 = 0;
        TotalGame = 0;
        return res.json({
          percentage,
          progress: {
            top50: finishTop50,
            game: finishGame,
            calculating: calculating,
            all: finishAll,
          },
          errMinus: errMinus.length > 0 ? errMinus : [],
          errMsg: errMsg.length > 0 ? errMsg : [],
        });
      }
      if (finishTop50 && finishGame && !updatePlacementProcess) {
        req.session.updatePlacementProcess = true;
        return res.json({
          percentage,
          progress: {
            top50: finishTop50,
            game: finishGame,
            calculating: calculating,
            all: finishAll,
          },
          errMinus: errMinus.length > 0 ? errMinus : [],
          errMsg: errMsg.length > 0 ? errMsg : [],
        });
      } else {
        return res.json({
          percentage,
          progress: {
            top50: finishTop50,
            game: finishGame,
            calculating: calculating,
            all: finishAll,
          },
          errMinus: errMinus.length > 0 ? errMinus : [],
          errMsg: errMsg.length > 0 ? errMsg : [],
        });
      }
    }
  },
  getDataTop50: async function (req, res) {
    if (!req.session.ID) {
      return res.redirect("/");
    }
    res.render(
      "uploads/dataTable/top50",
      { layout: false, csrfToken: req.csrfToken() },
      (err, html) => {
        if (err) {
          console.error("Error rendering template:", err);
        }
        return res.json({
          view: html,
        });
      }
    );
  },
  dataTop50: async function (req, res) {
    if (!req.session.ID) {
      return res.redirect("/");
    }
    let Loyalty = req.body.Loyalty ? req.body.Loyalty : "Bronze";
    let queryStartDate = `SELECT * FROM systab WHERE Config = 'StartDate' AND WebsiteID = '${process.env.websiteID}'`;
    let startDate = (await helpers.doQuery(db, queryStartDate)).results;
    let start =
      startDate.length > 0
        ? startDate[0].Value
          ? String(startDate[0].Value).padStart(2, "0")
          : "02"
        : "02";
    const today = new Date();
    const day = today.getDate();
    let end = String(parseInt(start) - 1).padStart(2, "0");
    if (day == parseInt(start) - 1) {
      dateCondition = `Date >= DATE_FORMAT(NOW() - INTERVAL 1 MONTH, '%Y-%m-${start}') AND Date <= DATE_FORMAT(NOW(), '%Y-%m-${end}')`;
    } else {
      dateCondition = `Date BETWEEN DATE_FORMAT(CURRENT_DATE(), '%Y-%m-${start}') AND DATE_FORMAT(DATE_ADD(NOW(), INTERVAL 1 MONTH), '%Y-%m-${end}')`;
    }
    let queryGetData = `SELECT CurrentPlacement, Username, Turnover FROM top_league 
        WHERE ${dateCondition}
        AND League = ? 
        AND WebsiteID = ?
        AND Turnover > 0
        ORDER BY CurrentPlacement, Username ASC`;
    let values = [Loyalty, process.env.websiteID];
    let getData = (await helpers.doQuery(db, queryGetData, values)).results;
    return res.json({
      data: getData,
    });
  },
  getDataTopSlot: async function (req, res) {
    if (!req.session.ID) {
      return res.redirect("/");
    }
    res.render(
      "uploads/dataTable/topSlot",
      { layout: false, csrfToken: req.csrfToken() },
      (err, html) => {
        if (err) {
          console.error("Error rendering template:", err);
        }
        return res.json({
          view: html,
        });
      }
    );
  },
  dataTopSlot: async function (req, res) {
    if (!req.session.ID) {
      return res.redirect("/");
    }
    let queryStartDate = `SELECT * FROM systab WHERE Config = 'StartDate' AND WebsiteID = '${process.env.websiteID}'`;
    let startDate = (await helpers.doQuery(db, queryStartDate)).results;
    let start =
      startDate.length > 0
        ? startDate[0].Value
          ? String(startDate[0].Value).padStart(2, "0")
          : "02"
        : "02";
    const today = new Date();
    const day = today.getDate();
    let end = String(parseInt(start) - 1).padStart(2, "0");
    if (day == parseInt(start) - 1) {
      dateCondition = `Date >= DATE_FORMAT(NOW() - INTERVAL 1 MONTH, '%Y-%m-${start}') AND Date <= DATE_FORMAT(NOW(), '%Y-%m-${end}')`;
    } else {
      dateCondition = `Date BETWEEN DATE_FORMAT(CURRENT_DATE(), '%Y-%m-${start}') AND DATE_FORMAT(DATE_ADD(NOW(), INTERVAL 1 MONTH), '%Y-%m-${end}')`;
    }
    let getData = (
      await helpers.doQuery(
        db,
        `SELECT CurrentPlacement, Username, Turnover FROM top_gamer 
        WHERE ${dateCondition}
        AND Game_Category = 'Slot' 
        AND WebsiteID = ? 
        AND Turnover > 0
        ORDER BY CurrentPlacement, Username ASC`,
        [process.env.websiteID]
      )
    ).results;
    return res.json({
      data: getData,
    });
  },
  getDataTopWD: async function (req, res) {
    if (!req.session.ID) {
      return res.redirect("/");
    }
    res.render(
      "uploads/dataTable/topWD",
      { layout: false, csrfToken: req.csrfToken() },
      (err, html) => {
        if (err) {
          console.error("Error rendering template:", err);
        }
        return res.json({
          view: html,
        });
      }
    );
  },
  dataTopWD: async function (req, res) {
    if (!req.session.ID) {
      return res.redirect("/");
    }
    let queryStartDate = `SELECT * FROM systab WHERE Config = 'StartDate' AND WebsiteID = '${process.env.websiteID}'`;
    let startDate = (await helpers.doQuery(db, queryStartDate)).results;
    let start =
      startDate.length > 0
        ? startDate[0].Value
          ? String(startDate[0].Value).padStart(2, "0")
          : "02"
        : "02";
    const today = new Date();
    const day = today.getDate();
    let end = String(parseInt(start) - 1).padStart(2, "0");
    if (day == parseInt(start) - 1) {
      dateCondition = `Date >= DATE_FORMAT(NOW() - INTERVAL 1 MONTH, '%Y-%m-${start}') AND Date <= LAST_DAY(NOW() - INTERVAL 1 MONTH)`;
    } else {
      dateCondition = `Date BETWEEN DATE_FORMAT(CURRENT_DATE(), '%Y-%m-${start}') AND LAST_DAY(CURRENT_DATE())`;
    }
    let getData = (
      await helpers.doQuery(
        db,
        `SELECT CurrentPlacement, Username, Withdraw FROM top_withdraw 
        WHERE ${dateCondition}
        AND WebsiteID = ?
        ORDER BY CurrentPlacement, Username ASC`,
        [process.env.websiteID]
      )
    ).results;
    return res.json({
      data: getData,
    });
  },
  getDataTopCasino: async function (req, res) {
    if (!req.session.ID) {
      return res.redirect("/");
    }
    res.render(
      "uploads/dataTable/topCasino",
      { layout: false, csrfToken: req.csrfToken() },
      (err, html) => {
        if (err) {
          console.error("Error rendering template:", err);
        }
        return res.json({
          view: html,
        });
      }
    );
  },
  dataTopCasino: async function (req, res) {
    if (!req.session.ID) {
      return res.redirect("/");
    }
    let queryStartDate = `SELECT * FROM systab WHERE Config = 'StartDate' AND WebsiteID = '${process.env.websiteID}'`;
    let startDate = (await helpers.doQuery(db, queryStartDate)).results;
    let start =
      startDate.length > 0
        ? startDate[0].Value
          ? String(startDate[0].Value).padStart(2, "0")
          : "02"
        : "02";
    const today = new Date();
    const day = today.getDate();
    let end = String(parseInt(start) - 1).padStart(2, "0");
    if (day == parseInt(start) - 1) {
      dateCondition = `Date >= DATE_FORMAT(NOW() - INTERVAL 1 MONTH, '%Y-%m-${start}') AND Date <= DATE_FORMAT(NOW(), '%Y-%m-${end}')`;
    } else {
      dateCondition = `Date BETWEEN DATE_FORMAT(CURRENT_DATE(), '%Y-%m-${start}') AND DATE_FORMAT(DATE_ADD(NOW(), INTERVAL 1 MONTH), '%Y-%m-${end}')`;
    }
    let getData = (
      await helpers.doQuery(
        db,
        `SELECT CurrentPlacement, Username, Turnover FROM top_gamer 
        WHERE ${dateCondition}
        AND Game_Category = ? 
        AND WebsiteID = ?
        AND Turnover > 0
        ORDER BY CurrentPlacement, Username ASC`,
        ["Casino", process.env.websiteID]
      )
    ).results;
    return res.json({
      data: getData,
    });
  },
  dataTop200: async function (req, res) {
    if (!req.session.ID) {
      return res.redirect("/login");
    }

    let queryStartDate = `SELECT * FROM systab WHERE Config = 'StartDate' AND WebsiteID = '${process.env.websiteID}'`;
    let startDate = (await helpers.doQuery(db, queryStartDate)).results;
    let start =
      startDate.length > 0
        ? startDate[0].Value
          ? String(startDate[0].Value).padStart(2, "0")
          : "02"
        : "02";
    const today = new Date();
    const day = today.getDate();
    let end = String(parseInt(start) - 1).padStart(2, "0");
    if (day == parseInt(start) - 1) {
      dateCondition = `Date >= DATE_FORMAT(NOW() - INTERVAL 1 MONTH, '%Y-%m-${start}') AND Date <= DATE_FORMAT(NOW(), '%Y-%m-${end}')`;
    } else {
      dateCondition = `Date BETWEEN DATE_FORMAT(CURRENT_DATE(), '%Y-%m-${start}') AND DATE_FORMAT(DATE_ADD(NOW(), INTERVAL 1 MONTH), '%Y-%m-${end}')`;
    }

    let table = ["top_gamer", "top_withdraw", "top_league"];
    let workbook = xlsx.utils.book_new();
    let Loyalties = ["Bronze", "Silver", "Gold", "Platinum", "Diamond"];
    for (const el of table) {
      if (el == "top_gamer") {
        const topSlot = await helpers.doQuery(
          db,
          `SELECT A.CurrentPlacement, A.Username, A.Turnover, A.Game_Category, COALESCE(B.Phone,'') AS Phone 
           FROM top_gamer A 
           LEFT JOIN user B ON A.Username = B.Username 
           WHERE A.Game_Category = ? 
           AND ${dateCondition}
           AND A.WebsiteID = ?
           AND A.Turnover > 0
           ORDER BY A.CurrentPlacement ASC LIMIT 200`,
          ["Slot", process.env.websiteID]
        );

        const topCasino = await helpers.doQuery(
          db,
          `SELECT A.CurrentPlacement, A.Username, A.Turnover, A.Game_Category, COALESCE(B.Phone,'') AS Phone 
           FROM top_gamer A 
           LEFT JOIN user B ON A.Username = B.Username 
           WHERE A.Game_Category = ? 
           AND ${dateCondition}
           AND A.WebsiteID = ?
           AND A.Turnover > 0
           ORDER BY A.CurrentPlacement ASC LIMIT 200`,
          ["Casino", process.env.websiteID]
        );

        const slotData =
          topSlot.results.length > 0
            ? topSlot.results.map((row) => ({
                Placement: row.CurrentPlacement,
                Username: row.Username,
                Turnover: row.Turnover,
                Phone: row.Phone,
              }))
            : [
                {
                  Placement: null,
                  Username: null,
                  Turnover: null,
                  Phone: null,
                },
              ];

        const casinoData =
          topCasino.results.length > 0
            ? topCasino.results.map((row) => ({
                Placement: row.CurrentPlacement,
                Username: row.Username,
                Turnover: row.Turnover,
                Phone: row.Phone,
              }))
            : [
                {
                  Placement: null,
                  Username: null,
                  Turnover: null,
                  Phone: null,
                },
              ];

        const slotSheet = xlsx.utils.json_to_sheet(slotData);
        const casinoSheet = xlsx.utils.json_to_sheet(casinoData);

        xlsx.utils.book_append_sheet(workbook, slotSheet, "Top Slot");
        xlsx.utils.book_append_sheet(workbook, casinoSheet, "Top Casino");
      }

      if (el == "top_withdraw") {
        const topWD = await helpers.doQuery(
          db,
          `SELECT A.CurrentPlacement, A.Username, A.Withdraw, COALESCE(B.Phone,'') AS Phone 
           FROM top_withdraw A 
           LEFT JOIN user B ON A.Username = B.Username 
           WHERE ${dateCondition}
            AND A.WebsiteID = ?
           ORDER BY A.CurrentPlacement ASC LIMIT 200 `,
          [process.env.websiteID]
        );

        const wdData =
          topWD.results.length > 0
            ? topWD.results.map((row) => ({
                Placement: row.CurrentPlacement,
                Username: row.Username,
                Withdraw: row.Withdraw,
                Phone: row.Phone,
              }))
            : [
                {
                  Placement: null,
                  Username: null,
                  Withdraw: null,
                  Phone: null,
                },
              ];

        const wdSheet = xlsx.utils.json_to_sheet(wdData);
        xlsx.utils.book_append_sheet(workbook, wdSheet, "Top WD");
      }
      if (el == "top_league") {
        for (const Loyalty of Loyalties) {
          try {
            const topWager = await helpers.doQuery(
              db,
              `SELECT A.CurrentPlacement, A.Username, A.Turnover, COALESCE(B.Phone,'') AS Phone 
               FROM top_league A 
               LEFT JOIN user B ON A.Username = B.Username 
               WHERE ${dateCondition}
               AND A.Loyalty = ?
               AND A.WebsiteID = ?
               AND A.Turnover > 0
               ORDER BY A.CurrentPlacement ASC LIMIT 200`,
              [Loyalty, process.env.websiteID]
            );

            const wagerData =
              topWager.results.length > 0
                ? topWager.results.map((row) => ({
                    Placement: row.CurrentPlacement,
                    Username: row.Username,
                    Turnover: row.Turnover,
                    Phone: row.Phone,
                  }))
                : [
                    {
                      Placement: null,
                      Username: null,
                      Turnover: null,
                      Phone: null,
                    },
                  ];

            const wagerSheet = xlsx.utils.json_to_sheet(wagerData);
            xlsx.utils.book_append_sheet(
              workbook,
              wagerSheet,
              `Top Wager ${Loyalty}`
            );
          } catch (error) {
            console.error(`Error processing Loyalty: ${Loyalty}`, error);
          }
        }
      }
    }

    const now = new Date();
    const tanggal = String(now.getDate()).padStart(2, "0");
    const bulan = String(now.getMonth() + 1).padStart(2, "0");
    const tahun = now.getFullYear();
    const fileName = `Data Top 200 ${tanggal}-${bulan}-${tahun}.xlsx`;
    const filePath = path.join(__dirname, fileName);
    xlsx.writeFile(workbook, filePath);
    res.download(filePath, fileName, (err) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Error generating file.");
      }
      fs.unlink(filePath, (unlinkErr) => {
        if (unlinkErr) {
          console.error("Error deleting the file:", unlinkErr);
        }
      });
    });
  },
  templateUpload: async function (req, res) {
    if (!req.session.ID) {
      return res.redirect("/login");
    }
    const workbook = xlsx.utils.book_new();

    const top50Data = [
      {
        Player: "Player1",
        Loyalty: "Gold",
        Turnover: 1000,
        "Fake Account": "n",
      },
      {
        Player: "Player2",
        Loyalty: "Silver",
        Turnover: 800,
        "Fake Account": "n",
      },
    ];

    const gameData = [
      { Player: "Player1", Slot: 500, Casino: 500, "Fake Account": "n" },
      { Player: "Player2", Slot: 300, Casino: 500, "Fake Account": "n" },
    ];

    // const withdrawData = [
    //   { Player: "Player1", Withdraw: 500 },
    //   { Player: "Player2", Withdraw: 300 },
    // ];

    const top50Sheet = xlsx.utils.json_to_sheet(top50Data);
    const gameSheet = xlsx.utils.json_to_sheet(gameData);
    // const withdrawSheet = xlsx.utils.json_to_sheet(withdrawData);

    xlsx.utils.book_append_sheet(workbook, top50Sheet, "Top 50");
    xlsx.utils.book_append_sheet(workbook, gameSheet, "Game");
    // xlsx.utils.book_append_sheet(workbook, withdrawSheet, "Withdraw");

    const now = new Date();
    const tanggal = String(now.getDate()).padStart(2, "0");
    const bulan = String(now.getMonth() + 1).padStart(2, "0");
    const tahun = now.getFullYear();
    const fileName = `Template Upload ${tanggal}-${bulan}-${tahun}.xlsx`;
    const filePath = path.join(__dirname, fileName);
    xlsx.writeFile(workbook, filePath);

    res.download(filePath, fileName, (err) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Error generating file.");
      }
      fs.unlink(filePath, (unlinkErr) => {
        if (unlinkErr) {
          console.error("Error deleting the file:", unlinkErr);
        }
      });
    });
  },
};
