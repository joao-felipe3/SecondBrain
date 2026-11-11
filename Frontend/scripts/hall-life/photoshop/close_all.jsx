// Fecha todos os documentos sem salvar e libera caches (usado antes de operacoes pesadas).
#target photoshop
app.displayDialogs = DialogModes.NO;
var log = new File(CFG.result);
log.encoding = 'UTF-8';
log.open('w');
try {
  while (app.documents.length) app.documents[0].close(SaveOptions.DONOTSAVECHANGES);
  app.purge(PurgeTarget.ALLCACHES);
  log.writeln('OK');
} catch (e) {
  log.writeln('ERRO: ' + e);
}
log.close();
// encerra o Photoshop para devolver memoria (e arquivo de paginacao) ao sistema
if (CFG.quit) executeAction(charIDToTypeID('quit'), undefined, DialogModes.NO);
