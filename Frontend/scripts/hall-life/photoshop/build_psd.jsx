// Monta/atualiza Hall-Life.psd: um grupo por vinheta, uma camada por frame, na posicao exata.
// Parametros injetados por run_photoshop.py na variavel CFG (JSON) antes deste arquivo.
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
  // pouco disco: menos estados de historico e caches limpos
  app.preferences.numberofHistoryStates = 2;
  app.purge(PurgeTarget.ALLCACHES);
  var psd = new File(CFG.psd);
  var doc;
  if (!psd.exists) {
    doc = app.open(new File(CFG.scene));
    // so a janela visivel do saguao (as coordenadas das camadas descontam CFG.crop)
    doc.crop([CFG.crop[0], CFG.crop[1], CFG.crop[2], CFG.crop[3]]);
    doc.activeLayer.name = 'Cena original (janela visivel)';
    var opts = new PhotoshopSaveOptions();
    opts.layers = true;
    doc.saveAs(psd, opts, false, Extension.LOWERCASE);
    log.writeln('criado ' + CFG.psd);
  } else {
    doc = app.open(psd);
  }

  for (var v = 0; v < CFG.vignettes.length; v++) {
    var vg = CFG.vignettes[v];
    var old = findGroup(doc, vg.id);
    if (old) old.remove();
    var group = doc.layerSets.add();
    group.name = vg.id;

    for (var f = 0; f < vg.frames.length; f++) {
      var fr = vg.frames[f];
      log.writeln('abrindo ' + fr.path);
      var src = app.open(new File(fr.path));
      app.activeDocument = src;
      var sb = src.activeLayer.bounds; // limites do conteudo dentro do patch
      var lay = src.activeLayer.duplicate(doc, ElementPlacement.PLACEATBEGINNING);
      src.close(SaveOptions.DONOTSAVECHANGES);
      app.activeDocument = doc;
      lay.name = vg.id + ' / ' + fr.name;
      // leva o conteudo para (x + offset no patch, y + offset no patch), qualquer que seja a posicao da copia
      var db = lay.bounds;
      var tx = vg.x - CFG.crop[0], ty = vg.y - CFG.crop[1];
      lay.translate(tx + sb[0].as('px') - db[0].as('px'), ty + sb[1].as('px') - db[1].as('px'));
      lay.move(group, ElementPlacement.INSIDE);
    }
    // nomeia pela posicao no grupo (topo = ultimo adicionado), independente da referencia devolvida
    for (var k = 0; k < group.artLayers.length; k++) {
      var nm = vg.frames[vg.frames.length - 1 - k].name;
      group.artLayers[k].name = vg.id + ' / ' + nm;
      group.artLayers[k].visible = nm === 'a';
    }
    log.writeln('vinheta ' + vg.id + ': ' + vg.frames.length + ' frames em (' + vg.x + ', ' + vg.y + ')');
  }

  doc.save();
  doc.close(SaveOptions.DONOTSAVECHANGES);
  log.writeln('OK');
} catch (e) {
  log.writeln('ERRO: ' + e + ' linha ' + e.line);
}
log.close();
