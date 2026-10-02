'use strict';

const SUPPORTED_ORIGIN = 'https://ussignandmill.squarecoil.net';
const DOCUMENT_TOKEN_DATASET_KEY = 'squarecoilCompanionDocumentToken';

function isSupportedSquareCoilUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.origin === SUPPORTED_ORIGIN;
  } catch (_) {
    return false;
  }
}

function isTopLevelWindow(targetWindow) {
  try {
    return Boolean(targetWindow && targetWindow.top === targetWindow);
  } catch (_) {
    return false;
  }
}

function isSupportedTopLevelContext(targetWindow) {
  try {
    return isTopLevelWindow(targetWindow) && isSupportedSquareCoilUrl(targetWindow.location.href);
  } catch (_) {
    return false;
  }
}

function isConcreteDocumentToken(value) {
  const token = String(value || '').trim();
  return token.length >= 16 && token.length <= 200;
}

module.exports = {
  SUPPORTED_ORIGIN,
  DOCUMENT_TOKEN_DATASET_KEY,
  isSupportedSquareCoilUrl,
  isTopLevelWindow,
  isSupportedTopLevelContext,
  isConcreteDocumentToken
};
