const { parentPort, workerData } = require("worker_threads");
const dotenv = require("dotenv");
const path = require("path");
const reader = require("xlsx");
const axios = require("axios");
dotenv.config();

const helpers = require("../../helpers/helpers");
const { db } = require("../../configs/db");
const loyalty = ["Bronze", "Silver", "Gold", "Platinum", "Diamond"];
const games = ["Slot", "Casino"];

async function sheetTop50(sheetData, bracketUrl, FileID) {
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
    dateCondition = `Date >= DATE_FORMAT(NOW() - INTERVAL 1 MONTH, '%Y-%m-${start}') AND Date <= DATE_FORMAT(NOW(), '%Y-%m-${end}') `;
  } else {
    dateCondition = `Date BETWEEN DATE_FORMAT(CURRENT_DATE(), '%Y-%m-${start}') AND DATE_FORMAT(DATE_ADD(NOW(), INTERVAL 1 MONTH), '%Y-%m-${end}')`;
  }
  return new Promise(async (resolve) => {
    parentPort.postMessage({
      message: `Processing Top 50 started`,
    });
    for (let [index, el] of sheetData.entries()) {
      if (!el.Player) {
        parentPort.postMessage({
          row: index + 2,
          message: "Terdapat Kolom Player yang Kosong",
        });
      } else {
        await new Promise(async (rslv, reject) => {
          let dateNow = helpers.formatDate(new Date());
          let token = `W${process.env.websiteID}|${el.Player}|${el.Loyalty}|${dateNow}`;
          token = Buffer.from(token).toString("base64");
          await axios
            .post(
              bracketUrl + "player-api",
              {},
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
              }
            )
            .then(async (response) => {
              if (
                response.data.player == true &&
                response.data.status == true
              ) {
                // cek level up
                if (el["Fake Account"].toLowerCase() == "n") {
                  const loyaltyLowerCase = loyalty.map((level) =>
                    level.toLowerCase()
                  );
                  let sqlLevelUp = `SELECT * FROM user WHERE Username = ?`;
                  let checkLevel = (
                    await helpers.doQuery(db, sqlLevelUp, [el.Player])
                  ).results;
                  if (checkLevel.length > 0) {
                    if (
                      checkLevel[0].Loyalty !== "" &&
                      checkLevel[0].Loyalty !== null &&
                      checkLevel[0].Loyalty !== undefined
                    ) {
                      let curIndex = loyaltyLowerCase.indexOf(
                        checkLevel[0].Loyalty.toLowerCase()
                      );
                      let levelIndex = loyaltyLowerCase.indexOf(
                        el.Loyalty.toLowerCase()
                      );
                      bonus = 0;

                      if (levelIndex > curIndex) {
                        let indexHadiah = curIndex + 1;
                        let selisih = levelIndex - curIndex;
                        for (let i = 0; i < selisih; i++) {
                          let prizeSql = `SELECT Bonus FROM loyalty_bonus WHERE Tier = ?`;
                          let prize = (
                            await helpers.doQuery(db, prizeSql, [
                              loyalty[indexHadiah],
                            ])
                          ).results;
                          if (prize[0]) {
                            bonus += prize[0]["Bonus"];
                          }
                          indexHadiah++;
                        }
                        // insert db levelUp history
                        db.query(
                          `INSERT INTO levelup_history (WebsiteID, Username, CurrentLevel, LevelUpTo, Prize, CDate) VALUES (?,?,?,?,?, NOW())`,
                          [
                            process.env.websiteID,
                            el.Player,
                            loyalty[curIndex],
                            loyalty[levelIndex],
                            bonus,
                          ],
                          function (err) {
                            if (err) {
                              console.error(err);
                            }
                            // update user loyalty
                            db.query(
                              `UPDATE user SET Loyalty = ?, LevelUpDate = NOW() WHERE Username = ?`,
                              [loyalty[levelIndex], el.Player.toString()],
                              function (err) {
                                if (err) {
                                  console.error(err);
                                }
                              }
                            );
                          }
                        );
                      }
                    } else {
                      db.query(
                        `UPDATE user SET Loyalty = ?, LevelUpDate = NOW() WHERE Username = ?`,
                        [el.Loyalty, el.Player.toString()],
                        function (err) {
                          if (err) {
                            console.error(err);
                          }
                        }
                      );
                    }
                  }
                }

                // cek player di top_league, ada update, ga ada insert
                cekLeague = `SELECT * FROM top_league WHERE Username = ? AND ${dateCondition};`;
                let resultLeague = (
                  await helpers.doQuery(db, cekLeague, [el.Player])
                ).results;
                // cek league
                const today = new Date();
                let curLeague = el.Loyalty;
                let lastLeague =
                  resultLeague.length > 0 ? resultLeague[0].Loyalty : "";
                if (today.getDate() !== parseInt(start)) {
                  curLeague =
                    resultLeague.length > 0
                      ? resultLeague[0].League
                      : el.Loyalty;
                }

                if (resultLeague.length > 0) {
                  db.query(
                    `UPDATE top_league set FileID = ?, Loyalty = ?, League = ?, Last_league = ?, Turnover = ?, Last_Date = NOW() WHERE ID = ?`,
                    [
                      FileID,
                      el.Loyalty,
                      curLeague,
                      lastLeague,
                      el.Turnover,
                      resultLeague[0].ID,
                    ],
                    function (err, result) {
                      if (err) {
                        console.log(err);
                        helpers.log_update(
                          "error",
                          `Player ${el.Player} not updated in top_league`
                        );
                        reject(err);
                      } else {
                        helpers.log_update(
                          "success",
                          `Player ${el.Player} updated in top_league`
                        );
                        rslv(result);
                      }
                    }
                  );
                } else {
                  db.query(
                    `INSERT INTO top_league (FileID, Date, WebsiteID, Loyalty, League, Last_League, Username, FakeAcc, Turnover,CDate) VALUE (?,NOW(),?,?,?,'',?,?,?, NOW())`,
                    [
                      FileID,
                      process.env.websiteID,
                      el.Loyalty,
                      el.Loyalty,
                      el.Player,
                      el["Fake Account"].toLowerCase() == "n" ? 0 : 1,
                      el.Turnover,
                    ],
                    function (err, result) {
                      if (err) {
                        console.log(err);
                        helpers.log_update(
                          "error",
                          `Player ${el.Player} not updated in top_league`
                        );
                        reject(err);
                      } else {
                        console.log(result);
                        rslv(result);
                      }
                    }
                  );
                }
              } else {
                db.query(
                  `SELECT TotalNotFound FROM files WHERE ID = ${FileID}`,
                  function (err, resultQuery) {
                    if (err) {
                      console.log(err);
                    }
                    let TotalNotFound =
                      resultQuery[0].TotalNotFound != 0
                        ? resultQuery[0].TotalNotFound
                        : 0;
                    TotalNotFound = TotalNotFound + 1;

                    db.query(
                      `UPDATE files SET TotalNotFound = ${TotalNotFound}, NotFoundTop50 = ${TotalNotFound} WHERE ID = ${FileID}`,
                      function (err) {
                        if (err) {
                          console.log(err);
                        }
                        helpers.log_update(
                          "error",
                          `Player ${el.Player} not found in top_league di row ${index + 2
                          }`
                        );
                        parentPort.postMessage({
                          row: index + 2,
                          player: el.Player,
                          message: `Top 50, Baris ${index + 2
                            } Player not found in the system`,
                        });
                        rslv();
                      }
                    );
                  }
                );
              }
            })
            .catch((err) => {
              console.log(`error : ${err}`);
              reject(err);
            });
        });
      }
    }
    parentPort.postMessage({ message: `Processing Top 50 completed` });
    resolve();
  });
}
async function sheetGame(sheetData, bracketUrl, FileID) {
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
    dateCondition = `Date >= DATE_FORMAT(NOW() - INTERVAL 1 MONTH, '%Y-%m-${start}') AND Date <= DATE_FORMAT(NOW(), '%Y-%m-${end}') `;
  } else {
    dateCondition = `Date BETWEEN DATE_FORMAT(CURRENT_DATE(), '%Y-%m-${start}') AND DATE_FORMAT(DATE_ADD(NOW(), INTERVAL 1 MONTH), '%Y-%m-${end}')`;
  }
  return await new Promise(async (resolve) => {
    parentPort.postMessage({
      message: `Processing Game started`,
    });
    for (let [index, el] of sheetData.entries()) {
      if (!el.Player) {
        parentPort.postMessage({
          row: index + 2,
          message: "Terdapat Kolom Player yang Kosong",
        });
      } else {
        await new Promise(async (rslv, reject) => {
          // wajib pake await, nnti dia malah return [Promise]
          let dateNow = helpers.formatDate(new Date());
          let token = `W${process.env.websiteID}|${el.Player}||${dateNow}`;
          token = Buffer.from(token).toString("base64");
          await axios
            .post(
              bracketUrl + "player-api",
              {},
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
              }
            )
            .then(async (response) => {
              if (
                response.data.player == true &&
                response.data.status == true
              ) {
                // cek db top_gamer dlu
                await new Promise(async (rs, rj) => {
                  // Use Promise.all to wait for all games to be processed
                  await Promise.all(
                    games.map(async (game) => {
                      cekGame = `SELECT * FROM top_gamer WHERE Username = ? AND ${dateCondition} AND Game_Category = ?`;
                      let resultGame = (
                        await helpers.doQuery(db, cekGame, [el.Player, game])
                      ).results;
                      to = 0;
                      if (game == "Slot") {
                        to = el.Slot > 0 ? el.Slot : 0;
                      } else if (game == "Casino") {
                        to = el.Casino > 0 ? el.Casino : 0;
                      }
                      if (resultGame.length > 0) {
                        return new Promise((resolve, reject) => {
                          db.query(
                            `UPDATE top_gamer SET FileID = ?, Turnover = ? WHERE Username = ? AND ${dateCondition} AND Game_Category = ?`,
                            [FileID, to, el.Player.toString(), game],
                            function (err) {
                              if (err) {
                                helpers.log_update(
                                  "error",
                                  `Player ${el.Player} not updated in top_game`
                                );
                                console.error(err);
                                reject(err);
                              } else {
                                resolve();
                              }
                            }
                          );
                        });
                      } else {
                        return new Promise((resolve, reject) => {
                          db.query(
                            `INSERT INTO top_gamer (FileID, Date, WebsiteID, Game_Category, Username, FakeAcc, Turnover, CDate) VALUE (?,NOW(),?,?,?,?,?,NOW())`,
                            [
                              FileID,
                              process.env.websiteID,
                              game,
                              el.Player,
                              el["Fake Account"].toLowerCase() == "n" ? 0 : 1,
                              to,
                            ],
                            function (err) {
                              if (err) {
                                console.error(err);
                                helpers.log_update(
                                  "error",
                                  `Player ${el.Player} not updated in top_game`
                                );
                                reject(err);
                              } else {
                                resolve();
                              }
                            }
                          );
                        });
                      }
                    })
                  );
                  rs(); // Resolve the inner Promise after all games are processed
                });
                rslv(); // Resolve the outer Promise after the inner Promise is resolved
              } else {
                let TotalNotFound = 0;
                let NotFoundGame = 0;
                let getTotalNotFound = (
                  await helpers.doQuery(
                    db,
                    `SELECT TotalNotFound, NotFoundGame FROM files WHERE ID = ${FileID}`
                  )
                ).results;
                if (getTotalNotFound.length == 0) {
                  TotalNotFound = 2;
                  NotFoundGame = 2;
                } else {
                  TotalNotFound = getTotalNotFound[0].TotalNotFound + 2;
                  NotFoundGame = getTotalNotFound[0].NotFoundGame + 2;
                }
                db.query(
                  `UPDATE files SET TotalNotFound = ${TotalNotFound}, NotFoundGame = ${NotFoundGame} WHERE ID = ${FileID}`,
                  function (err) {
                    if (err) {
                      console.log(err);
                      reject(err); // Reject the outer Promise if there's an error
                    } else {
                      helpers.log_update(
                        "error",
                        `Player ${el.Player} not found in top_gamer`
                      );
                      parentPort.postMessage({
                        row: index + 2,
                        player: el.Player,
                        message: `Top Game, Baris ${index + 2
                          } Player not found in the system`,
                      });
                      rslv(); // Resolve the outer Promise after updating TotalNotFound
                    }
                  }
                );
              }
            })
            .catch((err) => {
              console.log(err);
              reject(err); // Reject the outer Promise if axios.post fails
            });
        });
      }
    }
    parentPort.postMessage({ message: `Processing Game completed` });
    resolve(); // Resolve the main Promise after all players are processed
  });
}

async function main() {
  try {
    console.log(`Start time: ${new Date().toISOString()}`);
    const file = workerData.file;
    const FileID = workerData.FileID;
    let bracketUrl = (
      await helpers.doQuery(
        db,
        `SELECT * FROM config WHERE WebsiteID = ? AND Config ='Bracket URL'`,
        [process.env.websiteID]
      )
    ).results[0].Value;
    let sheetData = reader.utils.sheet_to_json(file.Sheets["Top 50"]);
    await sheetTop50(sheetData, bracketUrl.toString(), FileID);
    let sheetData2 = reader.utils.sheet_to_json(file.Sheets["Game"]);
    await sheetGame(sheetData2, bracketUrl.toString(), FileID);
    console.log(`End time: ${new Date().toISOString()}`);
    parentPort.postMessage({ message: "All sheets processed successfully" });
  } catch (err) {
    parentPort.postMessage({ error: err.message });
  }
}

main();
