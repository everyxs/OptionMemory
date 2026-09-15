use cozo::DbInstance;
use std::fs;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let db_path = "data/mnestic.rocksdb";

    // Clean start for the test
    if std::path::Path::new(db_path).exists() {
        fs::remove_dir_all(db_path)?;
    }

    // 1) Open a RocksDB-backed database
    let db = DbInstance::new("rocksdb", db_path, "")?;

    // 2) Create a stored relation and insert rows
    db.run_default(":create friend {name: String}")?;
    db.run_default("?[name] <- [['Alice'], ['Bob'], ['Charlie']] :put friend {name}")?;

    // 3) Query the relation
    let result = db.run_default("?[name] := *friend{name}")?;
    println!("After insert: {:?}", result.rows);

    // 4) Close the database
    drop(db);

    // 5) Reopen to demonstrate persistence
    let db2 = DbInstance::new("rocksdb", db_path, "")?;
    let result2 = db2.run_default("?[name] := *friend{name}")?;
    println!("After reopen: {:?}", result2.rows);

    Ok(())
}
