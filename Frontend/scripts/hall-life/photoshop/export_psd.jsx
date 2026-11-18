// Exporta de Hall-Life.psd (depois de retoques manuais) cada frame de cada vinheta como PNG,
// todos os frames de uma vinheta no mesmo retangulo (uniao dos limites do grupo).
#target photoshop
app.displayDialogs = DialogModes.NO;
app.preferences.rulerUnits = Units.PIXELS;

var log = new File(CFG.result);
log.encoding = 'UTF-8';
log.open('w');

function findGroup(doc, name) {
  for (var i = 0; i < doc.layerSets.length; i++) if (doc.layerSets[i].name === name) return doc.layerSets[i];
  return null;
}

try {
  app.preferences.numberofHistoryStates = 2;
  app.purge(PurgeTarget.ALLCACHES);
  var doc = app.open(new File(CFG.psd));
  var out = [];
  for (var v = 0; v < CFG.ids.length; v++) {
    var id = CFG.ids[v];
    var group = findGroup(doc, id);
    if (!group) {
      log.writeln('sem grupo ' + id);
      continue;
    }
    // uniao dos limites de todos os frames
    var L = 1e9, T = 1e9, R = -1e9, B = -1e9;
    for (var i = 0; i < group.artLayers.length; i++) {
      var b = group.artLayers[i].bounds;
      L = Math.min(L, b[0].as('px'));
      T = Math.min(T, b[1].as('px'));
      R = Math.max(R, b[2].as('px'));
      B = Math.max(B, b[3].as('px'));
    }
    var w = R - L, h = B - T;
    var dir = new Folder(CFG.outDir + '/' + id);
    if (!dir.exists) dir.create();
    var frames = [];
    for (var j = 0; j < group.artLayers.length; j++) {
      var lay = group.artLayers[j];
      var frameName = lay.name.split(' / ').pop();
      // fallback: se o nome nao for um frame conhecido, usa a ordem (topo = 'a')
      var known = CFG.frames[id] || [];
      var isKnown = false;
      for (var q = 0; q < known.length; q++) if (known[q] === frameName) isKnown = true;
      if (!isKnown && known[j]) frameName = known[j];
      var tmp = app.documents.add(w, h, doc.resolution, id + '-' + frameName, NewDocumentMode.RGB, DocumentFill.TRANSPARENT);
      app.activeDocument = doc;
      var dup = lay.duplicate(tmp, ElementPlacement.PLACEATBEGINNING);
      app.activeDocument = tmp;
      dup.visible = true;
      var db = dup.bounds;
      var lb = lay.bounds;
      dup.translate(lb[0].as('px') - L - db[0].as('px'), lb[1].as('px') - T - db[1].as('px'));
      // remove a camada vazia inicial
      for (var k = tmp.artLayers.length - 1; k >= 0; k--) if (tmp.artLayers[k] !== dup) tmp.artLayers[k].remove();
      var png = new PNGSaveOptions();
      png.compression = 6;
      tmp.saveAs(new File(dir.fsName + '/' + frameName + '.png'), png, true, Extension.LOWERCASE);
      tmp.close(SaveOptions.DONOTSAVECHANGES);
      app.activeDocument = doc;
      frames.push('"' + frameName + '"');
    }
    // devolve o retangulo em coordenadas da imagem completa (soma o recorte da janela visivel)
    out.push('"' + id + '": {"rect": [' + (L + CFG.crop[0]) + ', ' + (T + CFG.crop[1]) + ', ' + w + ', ' + h + '], "frames": [' + frames.join(', ') + ']}');
  }
  doc.close(SaveOptions.DONOTSAVECHANGES);
  var meta = new File(CFG.outDir + '/export.json');
  meta.encoding = 'UTF-8';
  meta.open('w');
  meta.write('{' + out.join(', ') + '}');
  meta.close();
  log.writeln('OK');
} catch (e) {
  log.writeln('ERRO: ' + e + ' linha ' + e.line);
}
log.close();
