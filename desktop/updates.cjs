const RELEASE_API =
  "https://api.github.com/repos/NFMynster/basementbandapp/releases/latest";
const RELEASE_PAGE =
  "https://github.com/NFMynster/basementbandapp/releases/latest";

function parseVersion(value) {
  const match = String(value)
    .trim()
    .match(
      /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/,
    );
  if (!match) return null;
  return {
    numbers: match.slice(1, 4).map(Number),
    prerelease: match[4]?.split(".") ?? [],
  };
}

function comparePrerelease(left, right) {
  if (!left.length || !right.length)
    return left.length ? -1 : right.length ? 1 : 0;
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    if (left[i] === undefined) return -1;
    if (right[i] === undefined) return 1;
    if (left[i] === right[i]) continue;
    const leftNumber = /^\d+$/.test(left[i]);
    const rightNumber = /^\d+$/.test(right[i]);
    if (leftNumber && rightNumber)
      return Number(left[i]) > Number(right[i]) ? 1 : -1;
    if (leftNumber !== rightNumber) return leftNumber ? -1 : 1;
    return left[i] > right[i] ? 1 : -1;
  }
  return 0;
}

function isNewerVersion(latest, current) {
  const left = parseVersion(latest);
  const right = parseVersion(current);
  if (!left || !right) return false;
  for (let i = 0; i < left.numbers.length; i++) {
    if (left.numbers[i] !== right.numbers[i])
      return left.numbers[i] > right.numbers[i];
  }
  return comparePrerelease(left.prerelease, right.prerelease) > 0;
}

async function checkForUpdate(fetchRelease, currentVersion) {
  try {
    const response = await fetchRelease(RELEASE_API, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": `Basement-Band/${currentVersion}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    // A repository without a published release returns 404. Updates are
    // deliberately quiet when GitHub or the network is unavailable.
    if (!response.ok) return { available: false };
    const release = await response.json();
    if (
      typeof release?.tag_name !== "string" ||
      !isNewerVersion(release.tag_name, currentVersion)
    )
      return { available: false };
    return {
      available: true,
      version: release.tag_name.replace(/^v/, ""),
    };
  } catch (error) {
    console.warn("Could not check for a Basement Band update", error);
    return { available: false };
  }
}

module.exports = {
  RELEASE_PAGE,
  checkForUpdate,
  isNewerVersion,
};
