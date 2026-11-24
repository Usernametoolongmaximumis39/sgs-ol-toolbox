import { verifyPackage } from './packages.js';

const LOBBY = 'poker-lobby';
const REPLAY = 'poker-replay';
const OLD_LOBBY = 'fd260286f73e30df493dec35a29838537279357098f9b7a45c57024020bde08e';
const PREVIOUS_MERGES = new Set([
  'a14110f60ba61179004a19410ac4286c25e48d0280b55782653c67cb503a811c',
  'a09e573a4c933361c773b69e3d0f5db27552f1dd2086c50d2dcd4ffec18e6f8f',
  '94d727101023e975861d6fc68a68d5924524371d3f20cc4526f1c846eb357906',
  'ad853e64c9efe9e9e86c705971e98000292d7f5957de7db739a5ff6a99b29c44',
  '185bc07523788e3c1974e371f01d97384c176822c97c632ba34121768c31496c',
  'e028c1e6cbee2e7574f1caa31ef798577550a810a7ebe4288ee0d55c4d12bb08',
  '4430ca0faad81c9b2259b994497b9e74fa7cc6bf7a76a4209bb0752c5c7b17a5',
  'b545517fe283cdb895a68cce12f1220a1bc8714201d05383e7a87b03f152644c',
  '68897ae6b46faddf38af11b3bd99c2374812b7873944c9965d58e99b8b02dbdc',
  '8764d6c880466a33459f47bf4412e82038853d4e143c0a0d1fa4ffa31f847731',
  '0e95a86b014fff9c3916b947099b63805abf7a1077efb46db438bc76d775d6dc',
  '157b0bb91f03dbdb65ef15b17f65d643dfcdf515f0064c966703e50bc3a334bc',
  'a1d99e167070775cb5cfe06c7dbb2109c03fb3a92f9efede17b54a69b4183ebe',
  '67e02fe936b28aed3f553726ae6a13a09ad8acb25222893100f1c7c092ab8f9f',
  'e43d812058d263c6dafec8364e280d50fb326b7ef4462476ccbcf4ed03be27b7',
  '72fa1379c509e57ce9ba46501ef355bdf17d8f89dc8fb14a3749905e09b984b9',
  'e25de527852d43ad5e0dc21ba44953b434e8516915b648c087c40e1d8df2cacc',
  '02dac33955c548e7e0b2d498ef80ef18b380ebb0578f2a7c5d5113b6101b1182',
  '80b51787cc3dd0c3d2b6143ab4022bf47b30d9861ddce38fd2f0f410d44965f2',
  '0c41a6ca07cf66482f4b01a78040cf3d8d840b1abb3d50d1864a05edf3f3366c',
  '9cbff6f7d62d17046f47bf3f1c4aba78c94f54d0d1e9092aca71188c4264c51f',
  'd83f2e9de69b0213a56df6097783b9003d71acb53896f672a0cf902b4bf217f3',
  'c7ec703b674ed3ea4aaac5356316b544b78e6b1c2be70ec451691b024fc9e030',
  '96b6a0ee9622cd1c27e6bbf0dacdc8895bba2b738b6c44c9c56b1d501173cf8a',
  '67ad0b7e24ef35154be6896d3730f6414ab91e83743de9cd1674a3228949bc61',
  'be07ccf8535c8dfaab62f9e47cc1363d4755d88eb5f5652b7570fc18f2462a16',
  '464c280d6fcbdc07b171dfe26904d950c6988cbe34aacfd811df725f4ea59f33',
  'b1193623cc263ef850807c3e706d3f9559bf01bcb6184c9fef205242a0234317',
  '5965be8c7775c3001289a1041a2586df4eb3b7a17114bedadd625bd29ca71523',
  '4bcb83b84619ec83e688d8126c64bef50fb0ee52338a8e0606005dc70aad987a',
  '7505328a9228d31c14c717f39558c26f0ac6a1cfa1986ccd861a6306113f72a3',
  'f9e6205aedbd763c3f92f4a249a268115fb28238c33f67ab07e432d093b72975',
  '283edcfa9c488ae4b01bc57d402d2df3be9130b506ca6940c957f002e3f9346f',
  '76be196abdec5678a171fd85b7e92f7b3bca0c03a05fa853990842bf8b53e5bd',
  '3b8a9c7febbc7abb599ec17ed34a7444b31b58d5ca840b9907d91e3b42614ff6',
  '6298f877a3fb02a44c3230fff40bee5166b09dbb812a86f58b1922d064b5513e',
  '9bee2a65754e93c3e114d8deb344f32713387fe087b90c3fe15c4dcbcfcad7c0',
  '526058a02914191c16a777d5ee67fd33dea3bc8e959b7010cde34f656b010ca4',
  '5908bc34415592289440fbad07d496f81f044b50c8e88e32d4e101bcacd3af33',
  'c62c82ec01223561f8bde536f9a2fe3a15d99a69aff0ca31227ad8d67bc0fd89',
  'c5fce0ce84779c09966789b741a9bcaa3c54de75fcdb4ab5dfc8543be0ef09c0',
  '99b1b0b5580e60b5ee511e47be4c88638fd287fc0e13ee51b95e1e8d89cb9a20',
]);
const OLD_REPLAYS = new Set([
  'fdfc23b82604669259dbb0ef5b1e8eaea97a53b05c9c9ac7337a4e24b81d6a2a',
  'b7cd62d56c686f8331280cafec63f2bc476d444b874628b3a6595ac591b4bc35',
  'dd453c9e1e0e64dfc9f48dda3806d890921c610a42bd5d64873abc2948656287',
  '24fc47965a358d9a054ff9b6789e1b1789a3e62212a73369c9f3bde0b845f841',
  'baace9085c3a6b65ac40638d9f90411916aee8c4af09bfe5052565586a81c3a6',
  '824a876db93954c4ff3d71a11fa71db04a951cb426a4c286ae1992e619ed5637',
  'defa38ce3ccf6097dbd2280ca1119d8c31ce333d668e5dd7e9c684bf0066c60a',
  'ea899505cbddfc3be45123588882077ce263170b8ea2fdb7aa00c6906dccd875',
  '76ad0732ccbc1b665f0cec8fb4dad358e2e1e2c76d28d4d542171694972e0338',
  '16a62c6d03402833b22cb4f76aa2432f165fd718d9ff899d6e75922e6a992269',
]);

export async function reconcilePokerPackages(records, builtins, store) {
  const merged = builtins.get(LOBBY)?.bundledPackage;
  if (!merged) return;
  const lobby = records.get(LOBBY);
  const legacy = records.get(REPLAY);
  const playback = legacy?.active || (!legacy?.previous?.builtin ? legacy?.previous : null);
  const lobbyPackage = lobby?.active || (!lobby?.previous?.builtin ? lobby?.previous : null);
  const previousHash = lobbyPackage?.sha256;
  const previouslyMerged = PREVIOUS_MERGES.has(previousHash);
  const previousLobby = previousHash === OLD_LOBBY || previouslyMerged;
  const migrations = lobby?.appliedBuiltinMigrations || [];
  const knownReplay = playback?.manifest?.id === REPLAY && OLD_REPLAYS.has(playback.sha256);
  const archived = legacy?.mergedInto === LOBBY;

  // Keep custom packages in charge. There may be a different local replay port.
  if (playback && !knownReplay) {
    if (!lobbyPackage) builtins.delete(LOBBY);
    return;
  }
  if (knownReplay) await verifyPackage(playback);
  if (lobby?.uninstalled) return;
  if (previousLobby && migrations.includes(previousHash)) {
    if (previousHash === OLD_LOBBY && knownReplay && archived) {
      const restored = { ...legacy, uninstalled: false };
      delete restored.mergedInto;
      await store.put(restored);
      records.set(REPLAY, restored);
    }
    return;
  }
  const archive = knownReplay && !legacy.uninstalled ? { ...legacy, uninstalled: true, mergedInto: LOBBY } : null;
  if (lobbyPackage?.sha256 === merged.sha256) {
    if (archive) {
      await store.put(archive);
      records.set(REPLAY, archive);
    }
    return;
  }
  if (lobbyPackage && !previousLobby) return;
  if (!lobby && !legacy) return;
  if (previousLobby) await verifyPackage(lobbyPackage);

  // Preserve an explicit stop choice when two enable switches become one.
  const appliedBuiltinMigrations = [...migrations];
  if (previousLobby) appliedBuiltinMigrations.push(previousHash);
  const next = { id: LOBBY, uninstalled: false, active: merged, previous: previousLobby ? lobbyPackage : null,
    enabled: lobby?.enabled !== false && (previouslyMerged || legacy?.enabled !== false),
    appliedBuiltinMigrations };
  await store.putMany(archive ? [next, archive] : [next]);
  records.set(LOBBY, next);
  if (archive) records.set(REPLAY, archive);
}
