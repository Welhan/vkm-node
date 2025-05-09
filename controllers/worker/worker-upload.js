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
  let start = "02";
  if (startDate.length > 0) {
    start = startDate[0].Value;
  }
  start = String(start).padStart(2, "0");
  const today = new Date();
  const day = today.getDate();
  let end = String(parseInt(start) - 1).padStart(2, "0");
  let dateCondition = "";
  if (day <= parseInt(start) - 1) {
    dateCondition = `Date >= DATE_FORMAT(NOW() - INTERVAL 1 MONTH, '%Y-%m-${start}') AND Date <= DATE_FORMAT(NOW(), '%Y-%m-${end}') `;
  } else {
    dateCondition = `Date BETWEEN DATE_FORMAT(CURRENT_DATE(), '%Y-%m-${start}') AND DATE_FORMAT(DATE_ADD(NOW(), INTERVAL 1 MONTH), '%Y-%m-${end}')`;
  }
  try {
    const bulkInsertData = [];
    const bulkInsertLevel = [];
    const bulkUpdateData = [];
    const bulkUpdateLevel = [];
    const bulkFakeAcc = [];

    const batchSize = 10;
    const batchSizeUsername = 100;
    const apiRequests = [];

    const loyaltyBonusQuery = `SELECT * FROM loyalty_bonus`;
    const loyaltyBonusResults = (await helpers.doQuery(db, loyaltyBonusQuery))
      .results;
    const loyaltyBonusMap = new Map(
      loyaltyBonusResults.map((bonus) => [bonus.Tier, bonus.Bonus])
    );

    const leagueUsernames = sheetData
      .map((el) => el.Player.toLowerCase())
      .filter((player) => player);
    const leagueMap = new Map();

    for (let i = 0; i < leagueUsernames.length; i += batchSizeUsername) {
      const batch = leagueUsernames.slice(i, i + batchSizeUsername);
      const leagueQuery = `SELECT * FROM top_league WHERE Username IN (?) AND ${dateCondition}`;
      const leagueResults = (await helpers.doQuery(db, leagueQuery, [batch]))
        .results;
      leagueResults.forEach((league) => {
        leagueMap.set(league.Username.toLowerCase(), league);
      });
    }
    let notFound = 0;
    let loopCount = 0;
    for (let [index, el] of sheetData.entries()) {
      helpers.log_update("success", `${el.Player}`);
      loopCount++;
      if (!el.Player) {
        parentPort.postMessage({
          row: index + 2,
          message: "Terdapat Kolom Player yang Kosong",
        });
      } else {
        let userResult = (
          await helpers.doQuery(db, `SELECT * FROM user WHERE Username = ?`, [
            el.Player.toLowerCase(),
          ])
        ).results[0];
        if (userResult) {
          if (el["Fake Account"].toLowerCase() === "n") {
            const loyaltyLowerCase = loyalty.map((level) =>
              level.toLowerCase()
            );
            if (
              userResult.Loyalty !== "" &&
              userResult.Loyalty !== null &&
              userResult.Loyalty !== undefined &&
              userResult.Loyalty !== el.Loyalty
            ) {
              let curIndex = loyaltyLowerCase.indexOf(
                userResult.Loyalty.toLowerCase()
              );
              let levelIndex = loyaltyLowerCase.indexOf(
                el.Loyalty.toLowerCase()
              );
              let bonus = 0;

              if (levelIndex > curIndex) {
                let indexHadiah = curIndex + 1;
                let selisih = levelIndex - curIndex;
                for (let i = 0; i < selisih; i++) {
                  const prize = loyaltyBonusMap.get(loyalty[indexHadiah]) || 0;
                  bonus += prize;
                  indexHadiah++;
                }
                bulkInsertLevel.push([
                  process.env.websiteID,
                  el.Player,
                  loyalty[curIndex],
                  loyalty[levelIndex],
                  bonus,
                  new Date(),
                ]);
              }
              bulkUpdateLevel.push({
                ID: userResult.ID,
                Username: userResult.Username,
                Loyalty: el.Loyalty,
              });
            }
          }
        }

        const resultLeague = leagueMap.get(el.Player);
        if (resultLeague) {
          const today = new Date();
          let curLeague = el.Loyalty;
          let lastLeague = resultLeague.Loyalty || "";

          if (today.getDate() !== parseInt(start)) {
            curLeague = resultLeague.Loyalty || curLeague;
          }
          if (el.Turnover < 0) {
            let query = `SELECT Turnover FROM top_league 
            WHERE Username = ? 
            AND Date BETWEEN DATE_FORMAT(CURRENT_DATE(), '%Y-%m-${start}') 
            AND DATE_FORMAT(DATE_ADD(NOW(), INTERVAL 1 MONTH), '%Y-%m-${end}')`;
            let getTurnover = (await helpers.doQuery(db, query, [el.Player]))
              .results;
            if (getTurnover.length > 0) {
              getTurnover = getTurnover[0].Turnover;
            } else {
              getTurnover = 0;
            }
            bulkUpdateData.push({
              ID: resultLeague.ID,
              FileID: FileID,
              League: curLeague,
              Last_League: lastLeague,
              Loyalty: el.Loyalty,
              Turnover: getTurnover,
              Last_Date: "NOW()",
            });
            parentPort.postMessage({
              minus: true,
              row: index + 2,
              player: el.Player,
              message: `Top 50, Line ${
                index + 2
              } Top 50 having a minus turnover`,
            });
          } else {
            bulkUpdateData.push({
              ID: resultLeague.ID,
              FileID: FileID,
              League: curLeague,
              Last_League: lastLeague,
              Loyalty: el.Loyalty,
              Turnover: el.Turnover,
              Last_Date: "NOW()",
            });
          }
        } else {
          let dateNow = helpers.formatDate(new Date());
          let token = `W${process.env.websiteID}|${el.Player}|${el.Loyalty}|${dateNow}`;
          token = Buffer.from(token).toString("base64");
          apiRequests.push(async () => {
            try {
              const response = await axios.post(
                bracketUrl + "player-api",
                {},
                {
                  headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                  },
                }
              );
              if (
                response.data.player === true &&
                response.data.status === true
              ) {
                if (el.Turnover < 0) {
                  let query = `SELECT Turnover FROM top_league 
                  WHERE Username = ? 
                  AND Date BETWEEN DATE_FORMAT(CURRENT_DATE(), '%Y-%m-${start}') 
                  AND DATE_FORMAT(DATE_ADD(NOW(), INTERVAL 1 MONTH), '%Y-%m-${end}')`;
                  let getTurnover = (
                    await helpers.doQuery(db, query, [el.Player])
                  ).results;
                  if (getTurnover.length > 0) {
                    getTurnover = getTurnover[0].Turnover;
                  } else {
                    getTurnover = 0;
                  }
                  bulkInsertData.push([
                    FileID,
                    new Date(),
                    process.env.websiteID,
                    el.Loyalty,
                    el.Loyalty,
                    el.Player,
                    el["Fake Account"].toLowerCase() === "n" ? 0 : 1,
                    getTurnover,
                    new Date(),
                  ]);
                  parentPort.postMessage({
                    minus: true,
                    row: index + 2,
                    player: el.Player,
                    message: `Top 50, Line ${
                      index + 2
                    } Top 50 having a minus turnover`,
                  });
                } else {
                  bulkInsertData.push([
                    FileID,
                    new Date(),
                    process.env.websiteID,
                    el.Loyalty,
                    el.Loyalty,
                    el.Player,
                    el["Fake Account"].toLowerCase() === "n" ? 0 : 1,
                    el.Turnover,
                    new Date(),
                  ]);
                }

                if (el["Fake Account"].toLowerCase() === "y") {
                  let fakeAccount = (
                    await helpers.doQuery(
                      db,
                      `SELECT * FROM fake_account WHERE Username = ?`,
                      [el.Player]
                    )
                  ).results;

                  if (fakeAccount.length === 0) {
                    bulkFakeAcc.push([
                      el.Player,
                      new Date(),
                      process.env.websiteID,
                    ]);
                  }
                }
              } else {
                notFound++;
                parentPort.postMessage({
                  minus: false,
                  row: index + 2,
                  player: el.Player,
                  message: `Top 50, Line ${
                    index + 2
                  } Top 50 Player not found in the system`,
                });
              }
            } catch (error) {
              console.log(`Error API: ${error}`);
            }
          });
        }
      }
    }
    if (apiRequests.length > 0) {
      for (let i = 0; i < apiRequests.length; i += batchSize) {
        const batch = apiRequests.slice(i, i + batchSize);
        await Promise.all(batch.map((request) => request()));
        if (i + batchSize >= apiRequests.length) {
          parentPort.postMessage({
            message: `Processing Insert Top 50 completed`,
          });
          db.query(
            `UPDATE files SET TotalNotFound = ${notFound}, NotFoundTop50 = ${notFound} WHERE ID = ${FileID}`,
            function (err) {
              if (err) {
                console.log(err);
              }
            }
          );
        }
      }
    } else {
      db.query(
        `UPDATE files SET TotalNotFound = ${notFound}, NotFoundTop50 = ${notFound} WHERE ID = ${FileID}`,
        function (err) {
          if (err) {
            console.log(err);
          }
        }
      );
    }

    if (bulkFakeAcc.length > 0) {
      for (let i = 0; i < bulkFakeAcc.length; i += batchSize) {
        const batch = bulkFakeAcc.slice(i, i + batchSize); // Ambil batch
        await new Promise((resolve, reject) => {
          const query = `
            INSERT INTO fake_account (Username, CDate, WebsiteID)
            VALUES ?
          `;
          db.query(query, [batch], function (err, results) {
            if (err) {
              console.error("Bulk insert failed:", err);
            } else {
              resolve();
            }
          });
        });
      }
    }

    if (bulkInsertLevel.length > 0) {
      for (let i = 0; i < bulkInsertLevel.length; i += batchSize) {
        const batch = bulkInsertLevel.slice(i, i + batchSize); // Ambil batch
        await new Promise((resolve, reject) => {
          const queryLevel = `
          INSERT INTO levelup_history (WebsiteID, Username, CurrentLevel, LevelUpTo, Prize, CDate)
          VALUES ?
        `;
          db.query(queryLevel, [batch], function (err, results) {
            if (err) {
              console.error("Bulk insert failed:", err);
            } else {
              resolve();
            }
          });
        });
      }
    }
    if (bulkUpdateLevel.length > 0) {
      for (let i = 0; i < bulkUpdateLevel.length; i += batchSize) {
        const batch = bulkUpdateLevel.slice(i, i + batchSize); // Ambil batch
        await new Promise((resolve, reject) => {
          const idLevel = batch.map((u) => `'${u.Username}'`).join(",");
          const loyaltyCases = batch
            .map((u) => `WHEN '${u.Username}' THEN '${u.Loyalty}'`)
            .join(" ");
          const updateLevel = `
            UPDATE user
            SET
              Loyalty = CASE Username ${loyaltyCases} END,
              UpdatedDate = NOW()
            WHERE Username IN (${idLevel});
          `;
          db.query(updateLevel, function (err, results) {
            if (err) {
              console.error("Bulk update failed:", err);
            } else {
              console.log(
                `Affected rows Update Level User: ${results.affectedRows}`
              );
              resolve();
            }
          });
        });
      }
    }
    if (bulkUpdateData.length > 0) {
      for (let i = 0; i < bulkUpdateData.length; i += batchSize) {
        const batch = bulkUpdateData.slice(i, i + batchSize);
        await new Promise((resolve, reject) => {
          const ids = batch.map((u) => u.ID).join(",");
          const turnoverCases = batch
            .map((u) => `WHEN ${u.ID} THEN ${u.Turnover}`)
            .join(" ");

          const updateSql = `
              UPDATE top_league
              SET
                Turnover = CASE ID ${turnoverCases} END,
                FileID = ${FileID},
                Last_Date = NOW()
              WHERE ID IN (${ids});
            `;

          db.query(updateSql, function (err, results) {
            if (err) {
              console.error("Bulk update failed:", err);
            } else {
              resolve();
            }
          });
        });
      }
    }
    if (bulkInsertData.length > 0) {
      for (let i = 0; i < bulkInsertData.length; i += batchSize) {
        const batch = bulkInsertData.slice(i, i + batchSize); // Ambil batch
        await new Promise((resolve, reject) => {
          const query = `
              INSERT INTO top_league (FileID, Date, WebsiteID, Loyalty, League, Username, FakeAcc, Turnover, CDate)
              VALUES ?
            `;
          db.query(query, [batch], function (err, results) {
            if (err) {
              console.error("Bulk insert failed:", err);
            } else {
              resolve();
            }
          });
        });
      }
    }
  } catch (error) {
    console.error(error);
  }
}

async function sheetGame(sheetData, bracketUrl, FileID) {
  let queryStartDate = `SELECT * FROM systab WHERE Config = 'StartDate' AND WebsiteID = '${process.env.websiteID}'`;
  let startDate = (await helpers.doQuery(db, queryStartDate)).results;
  let start = "02";
  if (startDate.length > 0) {
    start = startDate[0].Value;
  }
  const today = new Date();
  const day = today.getDate();
  let end = String(parseInt(start) - 1).padStart(2, "0");
  let dateCondition = "";
  if (day <= parseInt(start) - 1) {
    dateCondition = `Date >= DATE_FORMAT(NOW() - INTERVAL 1 MONTH, '%Y-%m-${start}') AND Date <= DATE_FORMAT(NOW(), '%Y-%m-${end}') `;
  } else {
    dateCondition = `Date BETWEEN DATE_FORMAT(CURRENT_DATE(), '%Y-%m-${start}') AND DATE_FORMAT(DATE_ADD(NOW(), INTERVAL 1 MONTH), '%Y-%m-${end}')`;
  }
  try {
    const bulkInsertData = new Array();
    const bulkUpdateData = new Array();
    const batchSize = 10;
    const batchSizeUsername = 100;
    const apiRequests = [];

    const gamerConditions = [];
    for (let el of sheetData) {
      for (let game of games) {
        gamerConditions.push([el.Player, game]);
      }
    }
    const gamerMap = new Map();

    for (let i = 0; i < gamerConditions.length; i += batchSizeUsername) {
      const batch = gamerConditions.slice(i, i + batchSizeUsername);
      const gamerQuery = `
        SELECT * 
        FROM top_gamer 
        WHERE (Username, Game_Category) IN (${batch
          .map(() => "(?, ?)")
          .join(", ")})
        AND ${dateCondition}`;
      const gamerValues = batch.flat();

      const gamerResults = (await helpers.doQuery(db, gamerQuery, gamerValues))
        .results;
      gamerResults.forEach((gamer) => {
        gamerMap.set(`${gamer.Username}-${gamer.Game_Category}`, gamer);
      });
    }
    let notFound = 0;
    let playerNotFound = new Array();
    for (let [index, el] of sheetData.entries()) {
      for (let game of games) {
        const gamerKey = `${el.Player}-${game}`;
        const resultGame = gamerMap.get(gamerKey);
        let turnover = 0;

        if (game === "Slot") {
          turnover = el.Slot > 0 ? el.Slot : 0;
        } else if (game === "Casino") {
          turnover = el.Casino > 0 ? el.Casino : 0;
        }

        if (resultGame) {
          bulkUpdateData.push({
            ID: resultGame.ID,
            FileID: FileID,
            Turnover: turnover,
          });
        } else {
          notFound++;
          playerNotFound.push({
            player: el.Player,
            game: game,
            turnover: turnover,
          });
        }
      }
    }
    for (let [index, el] of playerNotFound.entries()) {
      const token = `W${process.env.websiteID}|${el.player}|${
        el.game
      }|${new Date()}`;
      const encodedToken = Buffer.from(token).toString("base64");
      apiRequests.push(async () => {
        try {
          const response = await axios.post(
            bracketUrl + "player-api",
            {},
            {
              headers: {
                Authorization: `Bearer ${encodedToken}`,
                "Content-Type": "application/json",
              },
            }
          );
          if (response.data.player === true && response.data.status === true) {
            bulkInsertData.push([
              FileID,
              new Date(),
              process.env.websiteID,
              el.game,
              el.player,
              0,
              el.turnover,
              new Date(),
            ]);

            if (el["Fake Account"].toLowerCase() === "y") {
              let fakeAccount = (
                await helpers.doQuery(
                  db,
                  `SELECT * FROM fake_account WHERE Username = ?`,
                  [el.Player]
                )
              ).results;

              if (fakeAccount.length === 0) {
                bulkFakeAcc.push([
                  el.Player,
                  new Date(),
                  process.env.websiteID,
                ]);
              }
            }
          } else {
            notFound += 2;
            parentPort.postMessage({
              row: index + 2,
              player: el.player,
              message: `Top Wager, Baris ${
                index + 2
              } Player not found in the system`,
            });
          }
        } catch (error) {
          console.log(`Error API: ${error}`);
        }
      });
    }

    if (apiRequests.length > 0) {
      for (let i = 0; i < apiRequests.length; i += batchSize) {
        const batch = apiRequests.slice(i, i + batchSize);
        await Promise.all(batch.map((request) => request()));
        if (i + batchSize >= apiRequests.length) {
          let TotalNotFound = (
            await helpers.doQuery(
              db,
              `SELECT TotalNotFound FROM files WHERE ID = ${FileID}`
            )
          ).results[0].TotalNotFound;
          TotalNotFound = TotalNotFound + playerNotFound.length;
          db.query(
            `UPDATE files SET TotalNotFound = ${TotalNotFound}, NotFoundGame = ${playerNotFound.length} WHERE ID = ${FileID}`,
            function (err) {
              if (err) {
                console.log(err);
              }
              parentPort.postMessage({ message: `Processing Game completed` });
            }
          );
        }
      }
    } else {
      let TotalNotFound = (
        await helpers.doQuery(
          db,
          `SELECT TotalNotFound FROM files WHERE ID = ${FileID}`
        )
      ).results[0].TotalNotFound;
      TotalNotFound = TotalNotFound + notFound;
      db.query(
        `UPDATE files SET TotalNotFound = ${TotalNotFound}, NotFoundGame = ${notFound} WHERE ID = ${FileID}`,
        function (err) {
          if (err) {
            console.log(err);
          }
          parentPort.postMessage({ message: `Processing Game completed` });
        }
      );
    }

    if (bulkFakeAcc.length > 0) {
      for (let i = 0; i < bulkFakeAcc.length; i += batchSize) {
        const batch = bulkFakeAcc.slice(i, i + batchSize); // Ambil batch
        await new Promise((resolve, reject) => {
          const query = `
            INSERT INTO fake_account (Username, CDate, WebsiteID)
            VALUES ?
          `;
          db.query(query, [batch], function (err, results) {
            if (err) {
              console.error("Bulk insert failed:", err);
            } else {
              resolve();
            }
          });
        });
      }
    }

    if (bulkUpdateData.length > 0) {
      let completedBatches = 0;
      for (let i = 0; i < bulkUpdateData.length; i += batchSize) {
        const batch = bulkUpdateData.slice(i, i + batchSize);
        await new Promise((resolve, reject) => {
          const ids = batch.map((u) => u.ID).join(",");
          const turnoverCases = batch
            .map((u) => `WHEN ${u.ID} THEN ${u.Turnover}`)
            .join(" ");

          const updateSql = `
              UPDATE top_gamer
              SET
                Turnover = CASE ID ${turnoverCases} END,
                FileID = ${FileID},
                Last_Date = NOW()
              WHERE ID IN (${ids});
            `;
          db.query(updateSql, function (err, results) {
            if (err) {
              console.error("Bulk update failed:", err);
            } else {
              resolve();
            }
          });
        });
      }
    }
    if (bulkInsertData.length > 0) {
      for (let i = 0; i < bulkInsertData.length; i += batchSize) {
        const batch = bulkInsertData.slice(i, i + batchSize); // Ambil batch
        await new Promise((resolve, reject) => {
          const query = `
            INSERT INTO top_gamer (FileID, Date, WebsiteID, Game_Category, Username, FakeAcc, Turnover, CDate)
            VALUES ?
          `;

          db.query(query, [batch], function (err, results) {
            if (err) {
              console.error("Bulk insert failed:", err);
              db.query("ROLLBACK", function (rollbackErr) {
                if (rollbackErr) {
                  console.error("Rollback failed:", rollbackErr);
                }
                return reject(err);
              });
            } else {
              resolve();
            }
          });
        });
      }
    }
  } catch (error) {
    console.error(error);
  }
}

async function sheetWD(sheetData, bracketUrl, FileID) {
  let queryStartDate = `SELECT * FROM systab WHERE Config = 'StartDate' AND WebsiteID = '${process.env.websiteID}'`;
  let startDate = (await helpers.doQuery(db, queryStartDate)).results;
  let start = "02";
  if (startDate.length > 0) {
    start = startDate[0].Value;
  }
  const today = new Date();
  const day = today.getDate();
  let end = String(parseInt(start) - 1).padStart(2, "0");
  let dateCondition = "1=1";
  if (day <= parseInt(start) - 1) {
    dateCondition = `Date >= DATE_FORMAT(NOW() - INTERVAL 1 MONTH, '%Y-%m') AND Date <= DATE_FORMAT(NOW(), '%Y-%m') `;
  } else {
    dateCondition = `Date BETWEEN DATE_FORMAT(CURRENT_DATE(), '%Y-%m') AND LAST_DATE(CURRENT_DATE())`;
  }

  try {
    const bulkInsertData = new Array();
    const bulkUpdateData = new Array();
    const batchSize = 10;
    const batchSizeUsername = 100;
    const apiRequests = [];

    const wdCondition = [];
    for (let el of sheetData) {
      wdCondition.push([el.Player]);
    }
    const wdMap = new Map();

    for (let i = 0; i < wdCondition.length; i += batchSizeUsername) {
      const batch = wdCondition.slice(i, i + batchSizeUsername);
      const wdValues = batch.flat();

      const wdQuery = `
        SELECT * 
        FROM top_withdraw 
        WHERE (Username) IN (${batch.map(() => "(?)").join(", ")})
        AND ${dateCondition}`;

      const wdResults = (await helpers.doQuery(db, wdQuery, wdValues)).results;
      wdResults.forEach((wd) => {
        wdMap.set(`${wd.Username}`, wd);
      });
    }
    let notFound = 0;
    let playerNotFound = new Array();
    for (let [index, el] of sheetData.entries()) {
      const wdKey = `${el.Player}`;
      const resultWD = wdMap.get(wdKey);
      let Withdraw = 0;

      if (resultWD) {
        bulkUpdateData.push({
          ID: resultWD.ID,
          FileID,
          Withdraw,
        });
      } else {
        notFound++;
        playerNotFound.push({
          player: el.Player,
          Withdraw,
        });
      }
    }
    for (let [index, el] of playerNotFound.entries()) {
      apiRequests.push(async () => {
        try {
          let checkFakeAcc = (
            await helpers.doQuery(
              db,
              `SELECT * FROM fake_account WHERE Username = ?`,
              [el.Player]
            )
          ).results;
          if (checkFakeAcc.length > 0) {
            bulkInsertData.push([
              FileID,
              new Date(),
              process.env.websiteID,
              el.player,
              1,
              el.withdraw,
              new Date(),
            ]);
          } else {
            notFound += 1;
            parentPort.postMessage({
              row: index + 2,
              player: el.player,
              message: `Top Withdraw, Baris ${
                index + 2
              } Player not found in the system`,
            });
          }
        } catch (error) {
          console.log(`Error API: ${error}`);
        }
      });
    }

    if (apiRequests.length > 0) {
      for (let i = 0; i < apiRequests.length; i += batchSize) {
        const batch = apiRequests.slice(i, i + batchSize);
        await Promise.all(batch.map((request) => request()));
        if (i + batchSize >= apiRequests.length) {
          let TotalNotFound = (
            await helpers.doQuery(
              db,
              `SELECT TotalNotFound FROM files WHERE ID = ${FileID}`
            )
          ).results[0].TotalNotFound;
          TotalNotFound = TotalNotFound + playerNotFound.length;
          db.query(
            `UPDATE files SET TotalNotFound = ${TotalNotFound}, NotFoundWD = ${playerNotFound.length} WHERE ID = ${FileID}`,
            function (err) {
              if (err) {
                console.log(err);
              }
              parentPort.postMessage({
                message: `Processing Withdraw completed`,
              });
            }
          );
        }
      }
    } else {
      let TotalNotFound = (
        await helpers.doQuery(
          db,
          `SELECT TotalNotFound FROM files WHERE ID = ${FileID}`
        )
      ).results[0].TotalNotFound;
      TotalNotFound = TotalNotFound + notFound;
      db.query(
        `UPDATE files SET TotalNotFound = ${TotalNotFound}, NotFoundWD = ${notFound} WHERE ID = ${FileID}`,
        function (err) {
          if (err) {
            console.log(err);
          }
          parentPort.postMessage({ message: `Processing Withdraw completed` });
        }
      );
    }
    if (bulkUpdateData.length > 0) {
      for (let i = 0; i < bulkUpdateData.length; i += batchSize) {
        const batch = bulkUpdateData.slice(i, i + batchSize);
        await new Promise((resolve, reject) => {
          const ids = batch.map((u) => u.ID).join(",");
          const wdCases = batch
            .map((u) => `WHEN ${u.ID} THEN ${u.Withdraw}`)
            .join(" ");

          const updateSql = `
              UPDATE top_withdraw
              SET
                Withdraw = CASE ID ${wdCases} END,
                FileID = ${FileID},
                Last_Date = NOW()
              WHERE ID IN (${ids});
            `;
          db.query(updateSql, function (err, results) {
            if (err) {
              console.error("Bulk update failed:", err);
            } else {
              resolve();
            }
          });
        });
      }
    }
    if (bulkInsertData.length > 0) {
      for (let i = 0; i < bulkInsertData.length; i += batchSize) {
        const batch = bulkInsertData.slice(i, i + batchSize);
        await new Promise((resolve, reject) => {
          const query = `
            INSERT INTO top_withdraw (FileID, WebsiteID, Username, Withdraw, Last_Date)
            VALUES ?`;

          db.query(query, [batch], function (err, results) {
            if (err) {
              console.error("Bulk insert failed:", err);
              db.query("ROLLBACK", function (rollbackErr) {
                if (rollbackErr) {
                  console.error("Rollback failed:", rollbackErr);
                }
                return reject(err);
              });
            } else {
              resolve();
            }
          });
        });
      }
    }
  } catch (error) {
    console.error(error);
  }
}

async function main() {
  try {
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
    let sheetData2 = reader.utils.sheet_to_json(file.Sheets["Game"]);
    let sheetData3 = reader.utils.sheet_to_json(file.Sheets["Withdraw"]);
    if (sheetData.length > 0) {
      await sheetTop50(sheetData, bracketUrl.toString(), FileID);
    }
    if (sheetData2.length > 0) {
      await sheetGame(sheetData2, bracketUrl.toString(), FileID);
    }
    if (sheetData3.length > 0) {
      await sheetWD(sheetData3, bracketUrl.toString(), FileID);
    }
    parentPort.postMessage({ message: "All sheets processed successfully" });
  } catch (err) {
    parentPort.postMessage({ error: err.message });
  }
}

main();
